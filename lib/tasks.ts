import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CLAUDE_BIN, DATA_DIR } from "./config";
import type { PermissionMode, TaskDetail, TaskEvent, TaskSummary } from "./types";

const MAX_EVENTS = 600;
const HISTORY_EVENTS = 200;
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

interface Task extends TaskDetail {
  repoPath: string;
  proc?: ChildProcess;
  toolAgents: Map<string, string>; // Task tool_use id -> subagent name
  failed?: boolean;
}

interface Store {
  tasks: Map<string, Task>;
  bus: EventEmitter;
  loaded: boolean;
}

// Keep one store across hot reloads in dev.
const g = globalThis as unknown as { __agentDeck?: Store };
const store: Store = (g.__agentDeck ??= { tasks: new Map(), bus: new EventEmitter(), loaded: false });
store.bus.setMaxListeners(200);

function load() {
  if (store.loaded) return;
  store.loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")) as TaskDetail[];
    for (const t of raw) {
      if (store.tasks.has(t.id)) continue;
      store.tasks.set(t.id, {
        ...t,
        status: t.status === "running" ? "interrupted" : t.status,
        activeAgents: [],
        repoPath: "",
        toolAgents: new Map(),
      });
    }
  } catch {
    /* no history yet */
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const all = [...store.tasks.values()]
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 300)
        .map((t) => ({ ...detail(t), events: t.events.slice(-HISTORY_EVENTS) }));
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(all), "utf8");
    } catch (err) {
      console.error("[agent-deck] could not save history", err);
    }
  }, 500);
}

export function summary(t: Task): TaskSummary {
  return {
    id: t.id,
    repo: t.repo,
    agent: t.agent,
    title: t.title,
    status: t.status,
    permissionMode: t.permissionMode,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    sessionId: t.sessionId,
    model: t.model,
    costUsd: t.costUsd,
    durationMs: t.durationMs,
    turns: t.turns,
    activeAgents: t.activeAgents,
    lastActivity: t.lastActivity,
    eventCount: t.eventCount,
  };
}

function detail(t: Task): TaskDetail {
  return { ...summary(t), events: t.events };
}

function push(t: Task, ev: Omit<TaskEvent, "t">) {
  const full: TaskEvent = { t: Date.now(), ...ev };
  t.events.push(full);
  if (t.events.length > MAX_EVENTS) t.events.splice(0, t.events.length - MAX_EVENTS);
  t.eventCount++;
  if (ev.kind !== "you") t.lastActivity = ev.text.split("\n")[0].slice(0, 200);
  store.bus.emit(`event:${t.id}`, full);
  changed(t);
}

function changed(t: Task) {
  store.bus.emit(`update:${t.id}`, summary(t));
  store.bus.emit("tasks", summary(t));
  save();
}

/* ---------- stream-json parsing ---------- */

function short(v: unknown, n = 140): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function describeTool(name: string, input: Record<string, unknown>): string {
  const i = input || {};
  switch (name) {
    case "Bash":
      return `Running ${short(i.command, 160)}`;
    case "Read":
      return `Reading ${short(i.file_path)}`;
    case "Write":
      return `Writing ${short(i.file_path)}`;
    case "Edit":
    case "MultiEdit":
      return `Editing ${short(i.file_path)}`;
    case "Grep":
      return `Searching for ${short(i.pattern)}`;
    case "Glob":
      return `Finding ${short(i.pattern)}`;
    case "WebFetch":
      return `Fetching ${short(i.url)}`;
    case "WebSearch":
      return `Searching the web: ${short(i.query)}`;
    case "TodoWrite":
      return "Updating the plan";
    default:
      return `${name} ${short(i, 120)}`;
  }
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
}

function handleLine(t: Task, line: string) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line);
  } catch {
    if (line.trim()) push(t, { kind: "system", text: line.trim() });
    return;
  }
  const type = msg.type as string;
  const parent = (msg.parent_tool_use_id as string | null) || null;
  const agent = parent ? t.toolAgents.get(parent) : undefined;

  if (type === "system" && msg.subtype === "init") {
    t.sessionId = (msg.session_id as string) || t.sessionId;
    t.model = (msg.model as string) || t.model;
    push(t, { kind: "system", text: `Session started${t.model ? ` · ${t.model}` : ""}` });
    return;
  }

  if (type === "assistant") {
    const content = ((msg.message as { content?: ContentBlock[] })?.content || []) as ContentBlock[];
    for (const block of content) {
      if (block.type === "text" && block.text?.trim()) {
        push(t, { kind: "text", agent, text: block.text.trim() });
      } else if (block.type === "tool_use" && block.name) {
        const input = block.input || {};
        const sub = (input.subagent_type as string) || undefined;
        if ((block.name === "Task" || block.name === "Agent") && sub) {
          if (block.id) t.toolAgents.set(block.id, sub);
          if (!t.activeAgents.includes(sub)) t.activeAgents = [...t.activeAgents, sub];
          push(t, { kind: "delegate", agent, text: `Handing to @${sub}: ${short(input.description || input.prompt, 160)}` });
        } else {
          push(t, { kind: "tool", agent, text: describeTool(block.name, input) });
        }
      }
    }
    return;
  }

  if (type === "user") {
    const content = ((msg.message as { content?: ContentBlock[] | string })?.content || []) as ContentBlock[] | string;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result" && block.tool_use_id && t.toolAgents.has(block.tool_use_id)) {
          const sub = t.toolAgents.get(block.tool_use_id)!;
          t.activeAgents = t.activeAgents.filter((a) => a !== sub);
          push(t, { kind: "system", agent: sub, text: `@${sub} finished` });
        }
      }
    }
    return;
  }

  if (type === "result") {
    t.costUsd = typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : t.costUsd;
    t.durationMs = typeof msg.duration_ms === "number" ? msg.duration_ms : t.durationMs;
    t.turns = typeof msg.num_turns === "number" ? msg.num_turns : t.turns;
    t.sessionId = (msg.session_id as string) || t.sessionId;
    const isError = Boolean(msg.is_error) || (msg.subtype && msg.subtype !== "success");
    const text = typeof msg.result === "string" && msg.result.trim() ? msg.result.trim() : isError ? `Ended: ${msg.subtype}` : "Done";
    push(t, { kind: isError ? "error" : "result", text });
    if (isError) t.failed = true;
  }
}

/* ---------- running ---------- */

function run(t: Task, prompt: string, resume?: string) {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", t.permissionMode];
  if (resume) args.push("--resume", resume);

  t.status = "running";
  t.failed = false;
  t.endedAt = undefined;
  t.activeAgents = [];
  if (t.agent) t.activeAgents = [t.agent];
  changed(t);

  let proc: ChildProcess;
  try {
    proc = spawn(CLAUDE_BIN, args, { cwd: t.repoPath, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    finish(t, "error", `Could not start Claude Code: ${(err as Error).message}`);
    return;
  }
  t.proc = proc;

  let buf = "";
  proc.stdout?.setEncoding("utf8");
  const current = () => t.proc === proc; // ignore output from a process we already stopped
  proc.stdout?.on("data", (chunk: string) => {
    if (!current()) return;
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) handleLine(t, line);
    }
  });
  let stderr = "";
  proc.stderr?.setEncoding("utf8");
  proc.stderr?.on("data", (c: string) => {
    stderr += c;
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });
  proc.on("error", (err: NodeJS.ErrnoException) => {
    if (!current()) return;
    const msg =
      err.code === "ENOENT"
        ? `Claude Code CLI not found ("${CLAUDE_BIN}"). Install it with: npm install -g @anthropic-ai/claude-code — or set CLAUDE_BIN in .env.local to its full path (run: which claude).`
        : `Could not start Claude Code: ${err.message}`;
    finish(t, "error", msg);
  });
  proc.on("close", (code, signal) => {
    if (!current()) return;
    if (buf.trim()) handleLine(t, buf);
    buf = "";
    if (t.status !== "running") {
      t.proc = undefined;
      return;
    }
    if (signal) finish(t, "stopped", "Stopped");
    else if (code === 0) finish(t, t.failed ? "error" : "done");
    else finish(t, "error", stderr.trim() || `Claude Code exited with code ${code}`);
  });
}

function finish(t: Task, status: Task["status"], message?: string) {
  if (message) push(t, { kind: status === "error" ? "error" : "system", text: message });
  t.status = status;
  t.endedAt = Date.now();
  t.activeAgents = [];
  t.proc = undefined;
  changed(t);
}

export function startTask(opts: {
  repo: string;
  repoPath: string;
  agent: string | null;
  prompt: string;
  permissionMode: PermissionMode;
}): TaskSummary {
  load();
  const id = randomUUID().slice(0, 8);
  const t: Task = {
    id,
    repo: opts.repo,
    repoPath: opts.repoPath,
    agent: opts.agent,
    title: opts.prompt.split("\n")[0].slice(0, 120),
    status: "running",
    permissionMode: opts.permissionMode,
    startedAt: Date.now(),
    activeAgents: [],
    lastActivity: "Starting…",
    eventCount: 0,
    events: [],
    toolAgents: new Map(),
  };
  store.tasks.set(id, t);
  push(t, { kind: "you", text: opts.prompt });
  const prompt = opts.agent
    ? `Use the ${opts.agent} subagent for this task. Delegate the work to it and report back its result.\n\n${opts.prompt}`
    : opts.prompt;
  run(t, prompt);
  return summary(t);
}

export function replyTask(id: string, repoPath: string, prompt: string): TaskSummary {
  load();
  const t = store.tasks.get(id);
  if (!t) throw new Error("Task not found");
  if (t.status === "running") throw new Error("Task is still running");
  if (!t.sessionId) throw new Error("This task has no session to continue");
  t.repoPath = repoPath;
  push(t, { kind: "you", text: prompt });
  run(t, prompt, t.sessionId);
  return summary(t);
}

export function stopTask(id: string) {
  const t = store.tasks.get(id);
  if (!t || t.status !== "running") return false;
  const p = t.proc;
  p?.kill("SIGINT");
  setTimeout(() => {
    if (p && p.exitCode === null) p.kill("SIGKILL");
  }, 4000);
  finish(t, "stopped", "Stopped by you");
  return true;
}

export function listTasks(repo?: string): TaskSummary[] {
  load();
  return [...store.tasks.values()]
    .filter((t) => !repo || t.repo === repo)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(summary);
}

export function getTask(id: string): TaskDetail | null {
  load();
  const t = store.tasks.get(id);
  return t ? detail(t) : null;
}

export function subscribe(id: string, onEvent: (e: TaskEvent) => void, onUpdate: (s: TaskSummary) => void) {
  store.bus.on(`event:${id}`, onEvent);
  store.bus.on(`update:${id}`, onUpdate);
  return () => {
    store.bus.off(`event:${id}`, onEvent);
    store.bus.off(`update:${id}`, onUpdate);
  };
}

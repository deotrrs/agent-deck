"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { api, timeAgo } from "./api";
import type { AgentDef, PermissionMode, RepoSummary, TaskSummary } from "@/lib/types";

interface Props {
  repo: string;
  summary: RepoSummary;
  tasks: TaskSummary[];
  working: number;
  draft: { text: string; agent: string | null; n: number } | null;
  onStarted: (t: TaskSummary) => void;
  onOpenTask: (id: string) => void;
  onAddAgent: () => void;
  onChanged: () => void;
}

const MODES: { id: PermissionMode; label: string; hint: string }[] = [
  { id: "acceptEdits", label: "Auto-accept edits", hint: "Edits files freely; commands outside the allowlist are refused" },
  { id: "plan", label: "Plan only", hint: "Reads and plans, changes nothing" },
  { id: "default", label: "Ask (strict)", hint: "Headless runs can't ask, so anything needing approval is refused" },
  { id: "bypassPermissions", label: "Bypass permissions", hint: "Runs everything without checks. Only for repos you trust" },
];

function statusFor(agent: string | null, tasks: TaskSummary[]) {
  const mine = tasks.filter((t) =>
    agent === null ? t.agent === null : t.agent === agent || t.activeAgents.includes(agent)
  );
  const running = mine.find((t) => t.status === "running" && (agent === null || t.activeAgents.includes(agent) || t.agent === agent));
  return { running, latest: mine[0] };
}

function AgentCard({
  name,
  subtitle,
  model,
  tools,
  color,
  tasks,
  agent,
  selected,
  onSelect,
  onOpenTask,
}: {
  name: string;
  subtitle: string;
  model: string;
  tools: string;
  color?: string;
  tasks: TaskSummary[];
  agent: string | null;
  selected: boolean;
  onSelect: () => void;
  onOpenTask: (id: string) => void;
}) {
  const { running, latest } = statusFor(agent, tasks);
  const task = running ?? latest;
  let pill = { cls: "idle", text: "Idle" };
  if (running) pill = { cls: "working", text: "Working" };
  else if (latest?.status === "error") pill = { cls: "error", text: "Needs a look" };
  else if (latest && latest.status === "done" && latest.endedAt && Date.now() - latest.endedAt < 30 * 60_000)
    pill = { cls: "done", text: "Done" };

  return (
    <div
      className={`card agent-card ${running ? "is-working" : ""} ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <div className="agent-head">
        <Avatar name={name} color={color} />
        <div className="agent-id">
          <h3>{name}</h3>
          <p className="clamp2">{subtitle}</p>
        </div>
        <span className={`status ${pill.cls}`}>
          <i />
          {pill.text}
        </span>
      </div>
      {task && <div className="task-title clamp1">{task.title}</div>}
      <button
        className={`activity ${running ? "live" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (task) onOpenTask(task.id);
        }}
        disabled={!task}
        title={task ? "Open in console" : undefined}
      >
        {running ? running.lastActivity : task ? `${task.status === "done" ? "Finished" : task.status} · ${timeAgo(task.endedAt ?? task.startedAt)}` : "Ready when you are."}
      </button>
      <div className="agent-foot">
        <span>{model}</span>
        <span>{tools}</span>
      </div>
    </div>
  );
}

export default function Overview({ repo, summary, tasks, working, draft, onStarted, onOpenTask, onAddAgent, onChanged }: Props) {
  const [prompt, setPrompt] = useState("");
  const [agent, setAgent] = useState<string | null>(null);
  const [mode, setMode] = useState<PermissionMode>("acceptEdits");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cmdMode, setCmdMode] = useState(false);
  const [cmd, setCmd] = useState("");
  const [args, setArgs] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draft) return;
    setCmdMode(false);
    setPrompt(draft.text);
    setAgent(draft.agent);
    box.current?.focus();
  }, [draft]);

  const agents = summary.agents;
  const toolsLabel = (a: AgentDef) => (a.tools.length ? `${a.tools.length} tools` : "all tools");

  const submit = async () => {
    const text = cmdMode ? (cmd ? `/${cmd}${args.trim() ? " " + args.trim() : ""}` : "") : prompt.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await api<TaskSummary>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ repo, prompt: text, agent: cmdMode ? null : agent, permissionMode: mode }),
      });
      onStarted(t);
      setPrompt("");
      setArgs("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addStarter = async () => {
    try {
      await api("/api/agents", { method: "POST", body: JSON.stringify({ repo, starter: true }) });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const selectedCmd = summary.commands.find((c) => c.name === cmd);

  return (
    <div className="overview">
      <section className="hero">
        <small>Your workspace</small>
        <h1>{summary.name}</h1>
        <div className="meta">
          {summary.branch && <span>⎇ {summary.branch}</span>}
          <span>{summary.changedCount} changed files</span>
          <span>{agents.length} agents</span>
          {!summary.hasClaudeMd && <span className="warn">no CLAUDE.md</span>}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>
            Your agents <span className={`badge ${working ? "hot" : ""}`}>{working ? `${working} working` : "all idle"}</span>
          </h2>
          <button className="ghost" onClick={onAddAgent}>
            ＋ Add an agent
          </button>
        </div>
        <div className="agent-grid">
          <AgentCard
            name="Main session"
            subtitle="Claude Code decides who does what and delegates to your agents."
            model="Default model"
            tools="all tools"
            color="purple"
            tasks={tasks}
            agent={null}
            selected={agent === null}
            onSelect={() => setAgent(null)}
            onOpenTask={onOpenTask}
          />
          {agents.map((a) => (
            <AgentCard
              key={a.name}
              name={a.name}
              subtitle={a.description || "No description"}
              model={a.model === "inherit" ? "Default model" : a.model[0].toUpperCase() + a.model.slice(1)}
              tools={toolsLabel(a)}
              color={a.color}
              tasks={tasks}
              agent={a.name}
              selected={agent === a.name}
              onSelect={() => setAgent(a.name)}
              onOpenTask={onOpenTask}
            />
          ))}
          {agents.length === 0 && (
            <div className="card starter">
              <h3>No agents in this repo yet</h3>
              <p>Start with a small team: lead, dev, qa and designer. They're saved as editable files in .claude/agents.</p>
              <button className="primary" onClick={addStarter}>
                Add starter team
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="card composer">
        <div className="composer-head">
          <h2>✦ New task</h2>
          <div className="seg">
            <button className={!cmdMode ? "on" : ""} onClick={() => setCmdMode(false)}>
              ✎ Write a task
            </button>
            <button className={cmdMode ? "on" : ""} onClick={() => setCmdMode(true)} disabled={!summary.commands.length} title={!summary.commands.length ? "No commands in this repo" : undefined}>
              ⌘ Run a command
            </button>
          </div>
        </div>

        {!cmdMode ? (
          <textarea
            ref={box}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want built or changed in this repository…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            rows={4}
          />
        ) : (
          <div className="cmd-row">
            <select value={cmd} onChange={(e) => setCmd(e.target.value)}>
              <option value="">Choose a command…</option>
              {summary.commands.map((c) => (
                <option key={c.name} value={c.name}>
                  /{c.name}
                </option>
              ))}
            </select>
            <input
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder={selectedCmd?.argumentHint || "Arguments (optional)"}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {selectedCmd && <p className="hint">{selectedCmd.description}</p>}
          </div>
        )}

        <div className="composer-foot">
          {!cmdMode && (
            <div className="handoff">
              <span>Hand it to</span>
              <button className={`chip ${agent === null ? "on" : ""}`} onClick={() => setAgent(null)}>
                ✦ Let Claude choose
              </button>
              {agents.map((a) => (
                <button key={a.name} className={`chip ${agent === a.name ? "on" : ""}`} onClick={() => setAgent(a.name)}>
                  <Avatar name={a.name} color={a.color} size={20} />@{a.name}
                </button>
              ))}
            </div>
          )}
          <div className="run-row">
            <select value={mode} onChange={(e) => setMode(e.target.value as PermissionMode)} title={MODES.find((m) => m.id === mode)?.hint}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button className="primary" onClick={submit} disabled={busy || (cmdMode ? !cmd : !prompt.trim())}>
              {busy ? "Starting…" : "▶ Run"}
            </button>
          </div>
        </div>
        {mode === "bypassPermissions" && <p className="hint warn">Bypass runs every command without asking. Use only on repos you trust.</p>}
        {err && <p className="hint error">{err}</p>}
        <p className="hint">⌘/Ctrl + Enter to run · {MODES.find((m) => m.id === mode)?.hint}</p>
      </section>
    </div>
  );
}

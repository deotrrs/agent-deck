import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOTS, USER_CLAUDE_DIR, HttpError, repoId } from "./config";
import { list, parseFrontmatter, str, stringifyFrontmatter } from "./frontmatter";
import type { AgentDef, CommandDef, RepoInfo, Scope, SkillDef } from "./types";

async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readSafe(file: string) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** Every folder in each project root that is a git repo or has Claude Code config. */
export async function listRepos(): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  for (const [i, root] of PROJECT_ROOTS.entries()) {
    const found: RepoInfo[] = [];
    for (const e of await readDirSafe(root.path)) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules" || e.name.includes(":")) continue;
      const full = path.join(root.path, e.name);
      const isGit = existsSync(path.join(full, ".git"));
      const hasClaude = existsSync(path.join(full, ".claude")) || existsSync(path.join(full, "CLAUDE.md"));
      if (isGit || hasClaude) found.push({ id: repoId(i, e.name), name: e.name, root: root.label, isGit, hasClaude });
    }
    repos.push(...found.sort((a, b) => a.name.localeCompare(b.name)));
  }
  return repos;
}

/* ---------------- agents ---------------- */

async function readAgentsFrom(base: string, scope: Scope): Promise<AgentDef[]> {
  const dir = path.join(base, ".claude", "agents");
  const userDir = path.join(base, "agents");
  const root = scope === "user" ? userDir : dir;
  const out: AgentDef[] = [];
  for (const e of await readDirSafe(root)) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const src = await readSafe(path.join(root, e.name));
    if (src == null) continue;
    const { data, body } = parseFrontmatter(src);
    out.push({
      name: str(data.name) || e.name.replace(/\.md$/, ""),
      description: str(data.description).replace(/\\n/g, " "),
      model: str(data.model) || "inherit",
      tools: list(data.tools),
      color: str(data.color) || undefined,
      prompt: body.trim(),
      scope,
      file: scope === "user" ? path.join("agents", e.name) : path.join(".claude", "agents", e.name),
    });
  }
  return out;
}

/** Project agents first; user-level agents with the same name are hidden (project wins). */
export async function readAgents(repoPath: string): Promise<AgentDef[]> {
  const project = await readAgentsFrom(repoPath, "project");
  const user = await readAgentsFrom(USER_CLAUDE_DIR, "user");
  const names = new Set(project.map((a) => a.name));
  return [...project, ...user.filter((a) => !names.has(a.name))].sort((a, b) =>
    a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === "project" ? -1 : 1
  );
}

export const AGENT_NAME = /^[a-z0-9][a-z0-9-]{0,48}$/;

export async function writeAgent(
  repoPath: string,
  input: { name: string; description: string; model?: string; tools?: string; color?: string; prompt: string; previousName?: string }
) {
  const name = input.name.trim().toLowerCase();
  if (!AGENT_NAME.test(name)) throw new HttpError(400, "Agent name must be lowercase letters, numbers and dashes");
  if (!input.description.trim()) throw new HttpError(400, "Description is required (Claude uses it to decide when to delegate)");
  const dir = path.join(repoPath, ".claude", "agents");
  await fs.mkdir(dir, { recursive: true });
  const content = stringifyFrontmatter(
    {
      name,
      description: input.description.trim(),
      tools: input.tools?.trim() || undefined,
      model: input.model && input.model !== "inherit" ? input.model : undefined,
      color: input.color || undefined,
    },
    input.prompt || `You are the ${name} agent.`
  );
  await fs.writeFile(path.join(dir, `${name}.md`), content, "utf8");
  // Renamed: move the old file aside rather than deleting it.
  if (input.previousName && input.previousName !== name && AGENT_NAME.test(input.previousName)) {
    const old = path.join(dir, `${input.previousName}.md`);
    if (existsSync(old)) await fs.rename(old, path.join(dir, `${input.previousName}.md.bak`));
  }
  return name;
}

const STARTER: { name: string; description: string; model: string; tools?: string; color: string; prompt: string }[] = [
  {
    name: "lead",
    description:
      "Technical lead. Use proactively at the start of non-trivial work to break a request into a short spec and plan, and at the end to review the result.",
    model: "opus",
    tools: "Read, Grep, Glob, Bash, WebFetch",
    color: "purple",
    prompt:
      "You are the technical lead for this repository.\n\n- Read the relevant code before planning.\n- Produce a concise spec: goal, files to touch, approach, risks, acceptance checks.\n- When reviewing, compare the diff against the spec and list concrete issues, most important first.\n- Do not edit files yourself; hand implementation to the dev agent.",
  },
  {
    name: "dev",
    description: "Developer. Use to implement an approved spec or a well-defined change: writes code, runs builds and tests.",
    model: "sonnet",
    color: "orange",
    prompt:
      "You are a senior developer on this repository.\n\n- Follow the existing code style, structure and conventions.\n- Make the smallest change that fully solves the task.\n- Run the project's build, lint and tests when available and fix what you broke.\n- Finish with a short summary of what changed and anything left undone.",
  },
  {
    name: "qa",
    description:
      "Quality control. Use after implementation to verify the change: run tests, check edge cases and accessibility, and report findings.",
    model: "sonnet",
    tools: "Read, Grep, Glob, Bash",
    color: "green",
    prompt:
      "You are the QA engineer.\n\n- Run the test suite and any relevant scripts.\n- Check edge cases, error states, accessibility and responsiveness for UI work.\n- Report findings as a numbered list with severity, file and line where possible.\n- Do not fix issues yourself unless they are trivial typos.",
  },
  {
    name: "designer",
    description: "UI/UX designer. Use for layout, styling, component design and visual polish of front-end work.",
    model: "sonnet",
    color: "pink",
    prompt:
      "You are a product designer who codes.\n\n- Keep the UI consistent with the existing design system and tokens.\n- Care about spacing, typography, contrast, states (hover, focus, empty, loading, error) and mobile layouts.\n- Explain design decisions briefly.",
  },
];

export async function createStarterTeam(repoPath: string) {
  const created: string[] = [];
  for (const a of STARTER) {
    const file = path.join(repoPath, ".claude", "agents", `${a.name}.md`);
    if (existsSync(file)) continue;
    await writeAgent(repoPath, a);
    created.push(a.name);
  }
  return created;
}

/* ---------------- commands & skills ---------------- */

async function walkMd(dir: string, prefix = ""): Promise<{ rel: string; full: string }[]> {
  const out: { rel: string; full: string }[] = [];
  for (const e of await readDirSafe(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkMd(full, `${prefix}${e.name}/`)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push({ rel: prefix + e.name.replace(/\.md$/, ""), full });
  }
  return out;
}

function firstLine(body: string) {
  return (body.split(/\r?\n/).find((l) => l.trim()) || "").replace(/^#+\s*/, "").slice(0, 160);
}

async function readCommandsFrom(dir: string, scope: Scope): Promise<CommandDef[]> {
  const out: CommandDef[] = [];
  for (const f of await walkMd(dir)) {
    const src = (await readSafe(f.full)) ?? "";
    const { data, body } = parseFrontmatter(src);
    out.push({
      name: f.rel.replace(/\//g, ":"),
      description: str(data.description) || firstLine(body),
      argumentHint: str(data["argument-hint"]) || undefined,
      body: body.trim(),
      scope,
    });
  }
  return out;
}

export async function readCommands(repoPath: string): Promise<CommandDef[]> {
  const project = await readCommandsFrom(path.join(repoPath, ".claude", "commands"), "project");
  const user = await readCommandsFrom(path.join(USER_CLAUDE_DIR, "commands"), "user");
  const names = new Set(project.map((c) => c.name));
  return [...project, ...user.filter((c) => !names.has(c.name))];
}

async function readSkillsFrom(dir: string, scope: Scope): Promise<SkillDef[]> {
  const out: SkillDef[] = [];
  for (const e of await readDirSafe(dir)) {
    if (!e.isDirectory()) continue;
    const src = await readSafe(path.join(dir, e.name, "SKILL.md"));
    if (src == null) continue;
    const { data, body } = parseFrontmatter(src);
    out.push({
      name: str(data.name) || e.name,
      description: str(data.description) || firstLine(body),
      body: body.trim(),
      scope,
    });
  }
  return out;
}

export async function readSkills(repoPath: string): Promise<SkillDef[]> {
  const project = await readSkillsFrom(path.join(repoPath, ".claude", "skills"), "project");
  const user = await readSkillsFrom(path.join(USER_CLAUDE_DIR, "skills"), "user");
  const names = new Set(project.map((s) => s.name));
  return [...project, ...user.filter((s) => !names.has(s.name))];
}

/* ---------------- CLAUDE.md ---------------- */

export async function readClaudeMd(repoPath: string) {
  const file = path.join(repoPath, "CLAUDE.md");
  const content = await readSafe(file);
  return { exists: content != null, content: content ?? "" };
}

export async function writeClaudeMd(repoPath: string, content: string) {
  await fs.writeFile(path.join(repoPath, "CLAUDE.md"), content, "utf8");
}

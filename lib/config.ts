import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ProjectRoot {
  label: string; // short name shown in the repo picker, e.g. "develop"
  path: string;
}

function expandHome(p: string) {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

/**
 * Folders that hold your projects.
 * PROJECTS_ROOTS: comma-separated list (first one is the primary).
 * PROJECTS_ROOT: a single folder (older setting, still supported).
 * Default: the parent of this app's folder.
 */
function readRoots(): ProjectRoot[] {
  const raw = process.env.PROJECTS_ROOTS || process.env.PROJECTS_ROOT || path.join(process.cwd(), "..");
  const roots: ProjectRoot[] = [];
  const seenPaths = new Set<string>();
  const seenLabels = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const full = path.resolve(expandHome(trimmed));
    if (seenPaths.has(full)) continue;
    seenPaths.add(full);
    let label = path.basename(full) || full;
    for (let i = 2; seenLabels.has(label); i++) label = `${path.basename(full)}-${i}`;
    seenLabels.add(label);
    roots.push({ label, path: full });
  }
  return roots;
}

export const PROJECT_ROOTS = readRoots();

/** The primary projects folder. */
export const PROJECTS_ROOT = PROJECT_ROOTS[0].path;

/**
 * Repo ids: a plain folder name for repos in the primary root ("cafe-ui"),
 * "<root label>:<folder>" for the others ("dev:my-app").
 */
export function repoId(rootIndex: number, name: string) {
  return rootIndex === 0 ? name : `${PROJECT_ROOTS[rootIndex].label}:${name}`;
}

export function parseRepoId(id: string): { root: ProjectRoot; name: string } | null {
  const i = id.indexOf(":");
  if (i < 0) return { root: PROJECT_ROOTS[0], name: id };
  const root = PROJECT_ROOTS.find((r, idx) => idx > 0 && r.label === id.slice(0, i));
  return root ? { root, name: id.slice(i + 1) } : null;
}

/** Where task history is stored. */
export const DATA_DIR = path.join(process.cwd(), ".data");

/** User-level Claude Code config (~/.claude). */
export const USER_CLAUDE_DIR = path.join(os.homedir(), ".claude");

/** The Claude Code CLI binary. */
export const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Resolve a repo id to an absolute path, refusing anything outside the project roots. */
export function resolveRepo(id: string | null | undefined): string {
  const parsed = id ? parseRepoId(id) : null;
  const name = parsed?.name;
  if (!parsed || !name || name.includes("/") || name.includes("\\") || name.includes(":") || name.startsWith(".")) {
    throw new HttpError(400, "Invalid repo name");
  }
  const full = path.join(parsed.root.path, name);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
    throw new HttpError(404, `Repo not found: ${id}`);
  }
  return full;
}

/** Folder name of a repo id ("dev:my-app" -> "my-app"). */
export function repoName(id: string) {
  return parseRepoId(id)?.name ?? id;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  return Promise.resolve()
    .then(fn)
    .catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, status);
    });
}

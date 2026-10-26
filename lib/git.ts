import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ChangedFile } from "./types";

function git(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export function isGitRepo(repoPath: string) {
  return existsSync(path.join(repoPath, ".git"));
}

export async function currentBranch(repoPath: string): Promise<string | null> {
  if (!isGitRepo(repoPath)) return null;
  const r = await git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (r.code === 0) return r.stdout.trim();
  // New repo with no commits yet.
  const s = await git(repoPath, ["symbolic-ref", "--short", "HEAD"]);
  return s.code === 0 ? s.stdout.trim() : null;
}

export async function changedFiles(repoPath: string): Promise<ChangedFile[]> {
  if (!isGitRepo(repoPath)) return [];
  const status = await git(repoPath, ["status", "--porcelain=v1", "-uall"]);
  if (status.code !== 0) return [];
  const files: ChangedFile[] = [];
  for (const line of status.stdout.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    let file = line.slice(3);
    if (file.includes(" -> ")) file = file.split(" -> ")[1];
    file = file.replace(/^"|"$/g, "");
    files.push({ path: file, status: code.trim() || code, added: null, removed: null });
  }
  const num = await git(repoPath, ["diff", "HEAD", "--numstat"]);
  if (num.code === 0) {
    const map = new Map<string, [number | null, number | null]>();
    for (const line of num.stdout.split("\n")) {
      const [a, r, ...rest] = line.split("\t");
      if (!rest.length) continue;
      let p = rest.join("\t");
      if (p.includes(" => ")) p = p.replace(/\{.* => (.*)\}/, "$1").replace(/.* => /, "");
      map.set(p, [a === "-" ? null : Number(a), r === "-" ? null : Number(r)]);
    }
    for (const f of files) {
      const n = map.get(f.path);
      if (n) [f.added, f.removed] = n;
    }
  }
  // Untracked files aren't in `git diff`; count their lines directly (skip big/binary files).
  for (const f of files) {
    if (f.status !== "??" || f.added != null) continue;
    try {
      const full = path.join(repoPath, f.path);
      if (statSync(full).size > 2_000_000) continue;
      const text = readFileSync(full, "utf8");
      if (text.includes("\u0000")) continue;
      f.added = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
      f.removed = 0;
    } catch {
      /* unreadable */
    }
  }
  return files;
}

export async function fileDiff(repoPath: string, file: string): Promise<string> {
  if (file.includes("..") || path.isAbsolute(file)) return "";
  let r = await git(repoPath, ["diff", "HEAD", "--", file]);
  if (r.code !== 0 || !r.stdout) r = await git(repoPath, ["diff", "--", file]);
  if (!r.stdout) {
    // Untracked file: diff against an empty file.
    r = await git(repoPath, ["diff", "--no-index", "--", "/dev/null", file]);
  }
  return r.stdout;
}

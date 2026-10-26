// Shared types used by both the API routes and the UI.

export type Scope = "project" | "user";

export interface AgentDef {
  name: string;
  description: string;
  model: string; // "inherit" when not set
  tools: string[]; // empty = all tools
  color?: string;
  prompt: string;
  scope: Scope;
  file: string; // path relative to the repo (project) or ~/.claude (user)
}

export interface CommandDef {
  name: string;
  description: string;
  argumentHint?: string;
  body: string;
  scope: Scope;
}

export interface SkillDef {
  name: string;
  description: string;
  body: string;
  scope: Scope;
}

export interface RepoInfo {
  id: string; // what the API takes: "cafe-ui" or "dev:my-app"
  name: string; // folder name
  root: string; // label of the projects folder it lives in
  isGit: boolean;
  hasClaude: boolean;
}

export interface RootInfo {
  label: string;
  path: string;
  exists: boolean;
}

export interface RepoSummary {
  id: string;
  name: string;
  root: string;
  path: string;
  branch: string | null;
  changedCount: number;
  agents: AgentDef[];
  commands: CommandDef[];
  skills: SkillDef[];
  hasClaudeMd: boolean;
}

export interface ChangedFile {
  path: string;
  status: string; // M, A, D, R, ?? ...
  added: number | null;
  removed: number | null;
}

export type TaskStatus = "running" | "done" | "error" | "stopped" | "interrupted";
export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypassPermissions";

export interface TaskEvent {
  t: number;
  kind: "text" | "tool" | "delegate" | "result" | "error" | "system" | "you";
  agent?: string;
  text: string;
}

export interface TaskSummary {
  id: string;
  repo: string;
  agent: string | null; // null = let Claude choose
  title: string;
  status: TaskStatus;
  permissionMode: PermissionMode;
  startedAt: number;
  endedAt?: number;
  sessionId?: string;
  model?: string;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
  activeAgents: string[];
  lastActivity: string;
  eventCount: number;
}

export interface TaskDetail extends TaskSummary {
  events: TaskEvent[];
}

import { HttpError, handle, json, resolveRepo } from "@/lib/config";
import { listTasks, startTask } from "@/lib/tasks";
import type { PermissionMode } from "@/lib/types";

export const dynamic = "force-dynamic";

const MODES: PermissionMode[] = ["default", "acceptEdits", "plan", "bypassPermissions"];

export function GET(req: Request) {
  return handle(() => {
    const repo = new URL(req.url).searchParams.get("repo") || undefined;
    return json({ tasks: listTasks(repo) });
  });
}

// POST { repo, prompt, agent?: string | null, permissionMode? }
export function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const repoPath = resolveRepo(body.repo);
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) throw new HttpError(400, "Describe the task first");
    const agent = typeof body.agent === "string" && body.agent ? body.agent : null;
    if (agent && !/^[A-Za-z0-9_-]+$/.test(agent)) throw new HttpError(400, "Invalid agent");
    const permissionMode: PermissionMode = MODES.includes(body.permissionMode) ? body.permissionMode : "acceptEdits";
    return json(startTask({ repo: body.repo, repoPath, agent, prompt, permissionMode }));
  });
}

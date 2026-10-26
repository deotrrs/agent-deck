import { HttpError, handle, json, resolveRepo } from "@/lib/config";
import { getTask, replyTask, stopTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const task = getTask((await params).id);
    if (!task) throw new HttpError(404, "Task not found");
    return json(task);
  });
}

// POST { prompt } -> continue the same Claude Code session with a follow-up
export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const task = getTask(id);
    if (!task) throw new HttpError(404, "Task not found");
    const body = await req.json();
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) throw new HttpError(400, "Write a follow-up first");
    try {
      return json(replyTask(id, resolveRepo(task.repo), prompt));
    } catch (err) {
      throw new HttpError(409, (err as Error).message);
    }
  });
}

// DELETE -> stop a running task
export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => json({ stopped: stopTask((await params).id) }));
}

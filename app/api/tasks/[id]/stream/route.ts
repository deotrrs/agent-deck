import { getTask, subscribe } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-sent events: a snapshot of the task, then each new event and status update.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return new Response("Task not found", { status: 404 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("snapshot", task);
      const unsub = subscribe(
        id,
        (ev) => send("event", ev),
        (s) => send("update", s)
      );
      const ping = setInterval(() => send("ping", Date.now()), 15000);
      cleanup = () => {
        unsub();
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

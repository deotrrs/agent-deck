import { createStarterTeam, writeAgent } from "@/lib/claudefs";
import { HttpError, handle, json, resolveRepo } from "@/lib/config";

export const dynamic = "force-dynamic";

// POST { repo, starter: true }            -> create the starter team
// POST { repo, name, description, ... }    -> create or update a project agent
export function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const repoPath = resolveRepo(body.repo);
    if (body.starter) return json({ created: await createStarterTeam(repoPath) });
    if (typeof body.name !== "string") throw new HttpError(400, "name is required");
    const name = await writeAgent(repoPath, {
      name: body.name,
      description: String(body.description ?? ""),
      model: body.model,
      tools: body.tools,
      color: body.color,
      prompt: String(body.prompt ?? ""),
      previousName: body.previousName,
    });
    return json({ name });
  });
}

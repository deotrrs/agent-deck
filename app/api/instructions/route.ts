import { readClaudeMd, writeClaudeMd } from "@/lib/claudefs";
import { handle, json, resolveRepo } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle(async () => {
    const repoPath = resolveRepo(new URL(req.url).searchParams.get("repo"));
    return json(await readClaudeMd(repoPath));
  });
}

export function PUT(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const repoPath = resolveRepo(body.repo);
    await writeClaudeMd(repoPath, String(body.content ?? ""));
    return json({ ok: true });
  });
}

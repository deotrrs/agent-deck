import { existsSync } from "node:fs";
import { listRepos } from "@/lib/claudefs";
import { PROJECT_ROOTS, handle, json } from "@/lib/config";
import type { RootInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const roots: RootInfo[] = PROJECT_ROOTS.map((r) => ({ ...r, exists: existsSync(r.path) }));
    return json({ roots, repos: await listRepos() });
  });
}

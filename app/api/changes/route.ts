import { handle, json, resolveRepo } from "@/lib/config";
import { changedFiles, fileDiff } from "@/lib/git";

export const dynamic = "force-dynamic";

// GET ?repo=x            -> list of changed files
// GET ?repo=x&file=path  -> unified diff for one file
export function GET(req: Request) {
  return handle(async () => {
    const params = new URL(req.url).searchParams;
    const repoPath = resolveRepo(params.get("repo"));
    const file = params.get("file");
    if (file) return json({ file, diff: await fileDiff(repoPath, file) });
    return json({ files: await changedFiles(repoPath) });
  });
}

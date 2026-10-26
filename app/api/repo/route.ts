import { readAgents, readClaudeMd, readCommands, readSkills } from "@/lib/claudefs";
import { handle, json, parseRepoId, resolveRepo } from "@/lib/config";
import { changedFiles, currentBranch } from "@/lib/git";
import type { RepoSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handle(async () => {
    const name = new URL(req.url).searchParams.get("repo");
    const repoPath = resolveRepo(name);
    const [branch, changes, agents, commands, skills, md] = await Promise.all([
      currentBranch(repoPath),
      changedFiles(repoPath),
      readAgents(repoPath),
      readCommands(repoPath),
      readSkills(repoPath),
      readClaudeMd(repoPath),
    ]);
    const summary: RepoSummary = {
      id: name!,
      name: parseRepoId(name!)!.name,
      root: parseRepoId(name!)!.root.label,
      path: repoPath,
      branch,
      changedCount: changes.length,
      agents,
      commands,
      skills,
      hasClaudeMd: md.exists,
    };
    return json(summary);
  });
}

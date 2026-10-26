# Agent Deck

A local dashboard for running Claude Code agents across the projects in your `develop` folder.
Pick a repo, see its agents as cards, hand a task to one of them (or let Claude choose), and watch
the work stream in live, along with the files it changed.

Built with Next.js 16 (App Router), React 19 and TypeScript. It runs only on your machine
(bound to `127.0.0.1`) because it reads your files and launches your installed Claude Code.

## Requirements

- Node.js 20.9 or newer (the repo pins Node 24 in `.nvmrc`; npm 10+ comes with it)
- Claude Code installed and logged in. Check with `claude --version`
  (install: `npm install -g @anthropic-ai/claude-code`, then run `claude` once to sign in)
- git

## Run it

```bash
cd ~/path/agent-deck
nvm install   # first time only; reads .nvmrc
nvm use
npm install
npm run dev
```

Open http://localhost:3000.

It lists every folder in `~/path` (plus any extra folders in `PROJECTS_ROOTS`) that is a git repo or has a `.claude` folder.
Folders marked ✦ in the repo picker already have Claude Code config.

## Configuration

Settings live in `.env` (personal, not committed). `.env.example` documents every option.
Restart `npm run dev` after changing either.

```bash
# Project folders for the repo picker, comma-separated. The first one is the primary.
PROJECTS_ROOTS=~/path,~/dev
# Full path to the claude binary, if `claude` isn't found (find it with: which claude)
CLAUDE_BIN=/path/.nvm/versions/node/<your-version>/bin/claude
```

With several folders, the repo picker groups projects by folder name. Repos in the first folder
keep plain ids (`cafe-ui`); the others are prefixed with their folder name (`dev:my-app`).
The single-folder `PROJECTS_ROOT` setting still works.

## What each tab does

| Tab | What it shows | Where it lives |
| --- | --- | --- |
| Overview | Agent cards with live status, plus the **New task** box | |
| Analytics | Runs, success rate, cost and duration per agent | `.data/history.json` (this app) |
| Agents | Create and edit subagents: name, description, model, tools, system prompt | `<repo>/.claude/agents/*.md` |
| Commands | Your slash commands; **Use** drops one into the task box | `<repo>/.claude/commands/*.md` |
| Skills | Skills Claude can load automatically | `<repo>/.claude/skills/*/SKILL.md` |
| Instructions | Edit the repo's `CLAUDE.md` | `<repo>/CLAUDE.md` |
| Changes | `git status` with a diff viewer | the repo's git working tree |

User-level agents, commands and skills in `~/.claude/` show up too, tagged **user** (read-only here).

A repo with no agents gets an **Add starter team** button that creates `lead`, `dev`, `qa` and
`designer` agents you can then edit.

## How tasks run

Each task runs Claude Code headless in the repo folder:

```
claude -p "<your task>" --output-format stream-json --verbose --permission-mode <mode>
```

- **Hand it to @agent** prefixes the prompt with an instruction to delegate to that subagent.
- **Let Claude choose** sends the prompt as-is; Claude delegates on its own based on agent descriptions.
- The console at the bottom streams each step; cards glow orange while their agent is working.
- **Follow up** continues the same session (`--resume <session id>`). **Stop** interrupts the run.

### Permission modes

Headless runs can't stop to ask you for approval, so pick a mode up front:

- **Auto-accept edits** (default): edits files; shell commands not in your allowlist are refused.
- **Plan only**: reads and plans, changes nothing.
- **Ask (strict)**: anything that needs approval is refused.
- **Bypass permissions**: runs everything. Only use on repos you trust.

To let agents run builds and tests in auto-accept mode, allow those commands in the repo's
`.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(npm test*)", "Bash(npx tsc*)", "Bash(git status)", "Bash(git diff*)"]
  }
}
```

## Project layout

```
app/
  page.tsx                 dashboard shell (tabs, repo picker, console)
  api/repos                list project folders (PROJECTS_ROOTS) and the repos in them
  api/repo                 summary for one repo (branch, agents, commands, skills)
  api/agents               create/update agents, starter team
  api/instructions         read/write CLAUDE.md
  api/changes              git status + per-file diff
  api/tasks                start/list tasks; [id] follow-up/stop; [id]/stream live events (SSE)
components/                one file per tab + Console and pixel Avatar
lib/
  tasks.ts                 spawns claude, parses stream-json, keeps history
  claudefs.ts              reads/writes .claude files
  git.ts                   git helpers
```
# agent-deck

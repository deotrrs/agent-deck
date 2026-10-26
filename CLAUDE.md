# Agent Deck

Local Next.js dashboard that runs Claude Code agents across the repos in `~/Documents/develop`.
It reads each repo's `.claude/` folder, launches the `claude` CLI headless, and streams the results to the browser.
It is a local-only tool: it is never deployed and binds to `127.0.0.1`.

## Commands

Config comes from `.env` (copy `.env.example`). Never commit `.env`.

- `nvm use`: Node 24, from `.nvmrc`
- `npm install`
- `npm run dev`: dev server on http://localhost:3000
- `npm run typecheck`: `tsc --noEmit`, run this after every change
- `npm run build`: production build, run this before calling a change done

There is no test suite yet. Verify API changes with `curl` against the dev server.

## Stack

- Next.js 16 App Router, React 19, TypeScript (strict)
- Plain CSS in `app/globals.css`, with design tokens as CSS variables on `:root`. Do not add Tailwind or a UI library.
- No database. Task history lives in `.data/history.json`, which is gitignored.
- No runtime dependencies beyond `next`, `react` and `react-dom`. Ask before adding one.

## Layout

```
app/page.tsx               client shell: tabs, repo picker, polling, console
app/api/*/route.ts         API routes, all Node runtime and force-dynamic
components/                one component per tab, plus Console.tsx (SSE) and Avatar.tsx
lib/config.ts              PROJECT_ROOTS (from .env), repo ids, CLAUDE_BIN, resolveRepo(), handle()/json()
lib/claudefs.ts            reads and writes agents, commands, skills and CLAUDE.md
lib/git.ts                 status, numstat and per-file diff via execFile
lib/tasks.ts               spawns claude, parses stream-json, task store and history
lib/types.ts               types shared by the API and the UI
```

## Conventions

- Route handlers wrap their body in `handle(async () => ...)` and throw `HttpError(status, msg)` for user errors.
- Next 16 route params are a Promise: `{ params }: { params: Promise<{ id: string }> }`, then `await params`.
- Types used by both the server and the client go in `lib/types.ts`. Components never import from `lib/` modules that use Node APIs.
- Client fetches go through `api()` in `components/api.ts`.
- Status colors: orange `--work` means working, green `--ok` done, red `--bad` error.
- UI copy is short and plain.

## Safety rules (keep these intact)

- Every repo id from a request goes through `resolveRepo()`, which rejects slashes, dot-names, unknown root labels and anything outside the configured roots.
- Repo ids are the folder name for the primary root and `<root label>:<folder>` for the others. Task history stores these ids, so keep the format stable.
- Agent names must match `AGENT_NAME` (lowercase, digits, dashes) before touching the filesystem.
- `fileDiff()` rejects `..` and absolute paths.
- Never delete user files. Renamed agents are moved to `<name>.md.bak`.
- Run git and the CLI with `execFile`/`spawn` and argument arrays, never through a shell string.
- Keep the dev and start scripts bound to `127.0.0.1`.

## How tasks work (lib/tasks.ts)

- Command: `claude -p <prompt> --output-format stream-json --verbose --permission-mode <mode>`, plus `--resume <sessionId>` for follow-ups.
- Assigning a task to an agent prefixes the prompt with an instruction to delegate to that subagent.
- `Task`/`Agent` tool_use blocks with `subagent_type` mark that agent as active. Messages with `parent_tool_use_id` are attributed to it, and the matching `tool_result` marks it finished.
- The store lives on `globalThis.__agentDeck` so it survives dev hot reloads. Events go out on an EventEmitter that `/api/tasks/[id]/stream` relays as SSE.
- Output from a process that was already stopped is ignored through the `current()` guard in `run()`.

## Testing without spending tokens

Point `CLAUDE_BIN` at a fake script that prints stream-json lines, then run against a throwaway repo:

```bash
PROJECTS_ROOTS=/tmp/ad-root,/tmp/ad-dev CLAUDE_BIN=/tmp/fakeclaude npm run dev
```

The fake should emit `system/init`, an `assistant` message with a `Task` tool_use, a `user` tool_result, and a final `result` line with `total_cost_usd`, `duration_ms` and `session_id`.

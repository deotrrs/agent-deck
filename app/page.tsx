"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, q } from "@/components/api";
import Overview from "@/components/Overview";
import AgentsView from "@/components/AgentsView";
import { CommandsView, SkillsView } from "@/components/LibraryViews";
import InstructionsView from "@/components/InstructionsView";
import ChangesView from "@/components/ChangesView";
import AnalyticsView from "@/components/AnalyticsView";
import Console from "@/components/Console";
import type { RepoInfo, RepoSummary, RootInfo, TaskSummary } from "@/lib/types";

type Tab = "overview" | "analytics" | "agents" | "commands" | "skills" | "instructions" | "changes";

const LS_REPO = "agent-deck:repo";

function readLS(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export default function Home() {
  const [roots, setRoots] = useState<RootInfo[]>([]);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [repo, setRepo] = useState<string | null>(null);
  const [summary, setSummary] = useState<RepoSummary | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [openTasks, setOpenTasks] = useState<string[]>([]);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [editAgent, setEditAgent] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; agent: string | null; n: number } | null>(null);

  // Load repos once.
  useEffect(() => {
    api<{ roots: RootInfo[]; repos: RepoInfo[] }>("/api/repos")
      .then((d) => {
        setRoots(d.roots);
        setRepos(d.repos);
        const saved = readLS(LS_REPO);
        const pick = d.repos.find((r) => r.id === saved) ?? d.repos.find((r) => r.hasClaude) ?? d.repos[0];
        if (pick) setRepo(pick.id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const refreshSummary = useCallback(() => {
    if (!repo) return;
    api<RepoSummary>(`/api/repo?${q(repo)}`)
      .then((s) => {
        setSummary(s);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [repo]);

  useEffect(() => {
    if (!repo) return;
    writeLS(LS_REPO, repo);
    setSummary(null);
    refreshSummary();
  }, [repo, refreshSummary]);

  // Poll tasks; poll faster while something runs.
  const running = tasks.some((t) => t.status === "running");
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ tasks: TaskSummary[] }>("/api/tasks")
        .then((d) => alive && setTasks(d.tasks))
        .catch(() => {});
    load();
    const id = setInterval(load, running ? 1500 : 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [running]);

  // Refresh repo summary (changes count etc.) while agents are working and when they finish.
  useEffect(() => {
    if (!running) {
      refreshSummary();
      return;
    }
    const id = setInterval(refreshSummary, 6000);
    return () => clearInterval(id);
  }, [running, refreshSummary]);

  const repoTasks = useMemo(() => tasks.filter((t) => t.repo === repo), [tasks, repo]);
  const current = repos.find((r) => r.id === repo);
  const missingRoots = roots.filter((r) => !r.exists);
  const working = repoTasks.filter((t) => t.status === "running").length;

  const openTask = (id: string) => {
    setOpenTasks((o) => (o.includes(id) ? o : [...o, id]));
    setActiveTask(id);
  };
  const closeTask = (id: string) => {
    setOpenTasks((o) => o.filter((x) => x !== id));
    setActiveTask((a) => (a === id ? null : a));
  };

  const onStarted = (t: TaskSummary) => {
    setTasks((ts) => [t, ...ts.filter((x) => x.id !== t.id)]);
    openTask(t.id);
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "analytics", label: "Analytics" },
    { id: "agents", label: "Agents", count: summary?.agents.length },
    { id: "commands", label: "Commands", count: summary?.commands.length },
    { id: "skills", label: "Skills", count: summary?.skills.length },
    { id: "instructions", label: "Instructions" },
    { id: "changes", label: "Changes", count: summary?.changedCount },
  ];

  return (
    <div className={`shell ${openTasks.length ? "with-console" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="logo">A</div>
          <span>Agent Deck</span>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={`pill ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.count ? <span className="count">{t.count}</span> : null}
            </button>
          ))}
        </nav>
        <label className="repo-picker">
          <div className="repo-dot">{current?.name[0]?.toUpperCase() ?? "?"}</div>
          <div className="repo-text">
            <strong>{current?.name ?? "No repo"}</strong>
            <small>
              {roots.length > 1 && current ? `${current.root} · ` : ""}
              {summary?.branch ?? (summary ? "not a git repo" : "…")}
            </small>
          </div>
          <select value={repo ?? ""} onChange={(e) => setRepo(e.target.value)} aria-label="Repository">
            {roots.map((root) => {
              const inRoot = repos.filter((r) => r.root === root.label);
              if (!inRoot.length) return null;
              const options = inRoot.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.hasClaude ? "  ✦" : ""}
                </option>
              ));
              return roots.length > 1 ? (
                <optgroup key={root.label} label={root.label}>
                  {options}
                </optgroup>
              ) : (
                options
              );
            })}
          </select>
          <span className="chev">▾</span>
        </label>
      </header>

      <main className="content">
        {error && <div className="banner error">{error}</div>}
        {missingRoots.length > 0 && (
          <div className="banner error">
            Folder not found: {missingRoots.map((r) => r.path).join(", ")}. Check <code>PROJECTS_ROOTS</code> in <code>.env</code>.
          </div>
        )}
        {!repos.length && !error && roots.length > 0 && (
          <div className="empty">
            <h2>No projects found</h2>
            <p>
              Agent Deck looks for git repos in {roots.map((r) => r.path).join(", ")}. Set <code>PROJECTS_ROOTS</code> in{" "}
              <code>.env</code> to change it.
            </p>
          </div>
        )}
        {repo && summary && (
          <>
            {tab === "overview" && (
              <Overview
                repo={repo}
                summary={summary}
                tasks={repoTasks}
                working={working}
                draft={draft}
                onStarted={onStarted}
                onOpenTask={openTask}
                onAddAgent={() => {
                  setEditAgent("__new__");
                  setTab("agents");
                }}
                onChanged={refreshSummary}
              />
            )}
            {tab === "agents" && (
              <AgentsView
                repo={repo}
                agents={summary.agents}
                tasks={repoTasks}
                initial={editAgent}
                onSaved={() => {
                  setEditAgent(null);
                  refreshSummary();
                }}
              />
            )}
            {tab === "commands" && (
              <CommandsView
                commands={summary.commands}
                onUse={(text) => {
                  setDraft({ text, agent: null, n: Date.now() });
                  setTab("overview");
                }}
              />
            )}
            {tab === "skills" && <SkillsView skills={summary.skills} />}
            {tab === "instructions" && <InstructionsView repo={repo} onSaved={refreshSummary} />}
            {tab === "changes" && <ChangesView repo={repo} running={running} />}
            {tab === "analytics" && <AnalyticsView tasks={repoTasks} allTasks={tasks} repo={repo} onOpenTask={openTask} />}
          </>
        )}
        {repo && !summary && !error && <div className="loading">Loading {repo}…</div>}
      </main>

      {openTasks.length > 0 && (
        <Console
          tasks={tasks}
          open={openTasks}
          active={activeTask ?? openTasks[openTasks.length - 1]}
          onSelect={setActiveTask}
          onClose={closeTask}
          onStarted={onStarted}
        />
      )}
    </div>
  );
}

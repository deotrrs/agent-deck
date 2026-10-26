"use client";

import { duration, money, timeAgo } from "./api";
import type { TaskSummary } from "@/lib/types";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <span>{sub}</span>}
    </div>
  );
}

export default function AnalyticsView({
  tasks,
  allTasks,
  repo,
  onOpenTask,
}: {
  tasks: TaskSummary[];
  allTasks: TaskSummary[];
  repo: string;
  onOpenTask: (id: string) => void;
}) {
  const finished = tasks.filter((t) => t.status !== "running");
  const ok = finished.filter((t) => t.status === "done").length;
  const cost = tasks.reduce((n, t) => n + (t.costUsd ?? 0), 0);
  const allCost = allTasks.reduce((n, t) => n + (t.costUsd ?? 0), 0);
  const durs = finished.map((t) => t.durationMs ?? (t.endedAt ? t.endedAt - t.startedAt : 0)).filter(Boolean);
  const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : undefined;

  const byAgent = new Map<string, { runs: number; cost: number; failed: number }>();
  for (const t of tasks) {
    const k = t.agent ? `@${t.agent}` : "Main session";
    const v = byAgent.get(k) ?? { runs: 0, cost: 0, failed: 0 };
    v.runs++;
    v.cost += t.costUsd ?? 0;
    if (t.status === "error") v.failed++;
    byAgent.set(k, v);
  }
  const rows = [...byAgent.entries()].sort((a, b) => b[1].runs - a[1].runs);
  const max = Math.max(1, ...rows.map(([, v]) => v.runs));

  // Last 14 days of runs.
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const perDay = days.map((d) => {
    const next = d.getTime() + 86_400_000;
    return tasks.filter((t) => t.startedAt >= d.getTime() && t.startedAt < next).length;
  });
  const dayMax = Math.max(1, ...perDay);

  if (!tasks.length)
    return (
      <div className="empty card">
        <h2>No runs in {repo} yet</h2>
        <p>Run a task from the Overview tab and its cost, duration and outcome will show up here.</p>
      </div>
    );

  return (
    <div className="analytics">
      <div className="stats">
        <Stat label="Tasks run" value={String(tasks.length)} sub={`${tasks.filter((t) => t.status === "running").length} running now`} />
        <Stat label="Success rate" value={finished.length ? `${Math.round((ok / finished.length) * 100)}%` : "—"} sub={`${ok} of ${finished.length} completed successfully`} />
        <Stat label="Cost in this repo" value={money(cost)} sub={`${money(allCost)} across all repos`} />
        <Stat label="Avg duration" value={duration(avg)} />
      </div>

      <div className="two">
        <section className="card">
          <h3>Runs by agent</h3>
          <div className="bars">
            {rows.map(([k, v]) => (
              <div key={k} className="bar-row">
                <span className="bar-label">{k}</span>
                <div className="bar-track">
                  <div className="bar" style={{ width: `${(v.runs / max) * 100}%` }} />
                </div>
                <span className="bar-val">
                  {v.runs} · {money(v.cost)}
                  {v.failed ? ` · ${v.failed} failed` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>Last 14 days</h3>
          <div className="spark">
            {perDay.map((n, i) => (
              <div key={i} className="spark-col" title={`${days[i].toLocaleDateString()}: ${n} runs`}>
                <div className="spark-bar" style={{ height: `${(n / dayMax) * 100}%` }} />
                <small>{days[i].getDate()}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h3>Recent runs</h3>
        <table className="runs">
          <thead>
            <tr>
              <th>Task</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Cost</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {tasks.slice(0, 25).map((t) => (
              <tr key={t.id} onClick={() => onOpenTask(t.id)}>
                <td className="clamp1">{t.title}</td>
                <td>{t.agent ? `@${t.agent}` : "Main"}</td>
                <td>
                  <span className={`dot d-${t.status}`} /> {t.status}
                </td>
                <td>{duration(t.durationMs ?? (t.endedAt ? t.endedAt - t.startedAt : undefined))}</td>
                <td>{money(t.costUsd)}</td>
                <td>{timeAgo(t.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

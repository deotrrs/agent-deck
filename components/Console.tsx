"use client";

import { useEffect, useRef, useState } from "react";
import { api, duration, money } from "./api";
import type { TaskDetail, TaskEvent, TaskSummary } from "@/lib/types";

interface Props {
  tasks: TaskSummary[];
  open: string[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onStarted: (t: TaskSummary) => void;
}

function useTaskStream(id: string) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  useEffect(() => {
    setTask(null);
    const es = new EventSource(`/api/tasks/${id}/stream`);
    es.addEventListener("snapshot", (e) => setTask(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("event", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as TaskEvent;
      setTask((t) => (t ? { ...t, events: [...t.events, ev].slice(-600) } : t));
    });
    es.addEventListener("update", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as TaskSummary;
      setTask((t) => (t ? { ...t, ...s } : t));
    });
    es.onerror = () => {
      // Browser retries automatically; fall back to a one-off fetch so the view is never stale.
      api<TaskDetail>(`/api/tasks/${id}`).then(setTask).catch(() => {});
    };
    return () => es.close();
  }, [id]);
  return task;
}

const ICON: Record<TaskEvent["kind"], string> = {
  you: "›",
  text: "◆",
  tool: "⚙",
  delegate: "⇢",
  result: "✓",
  error: "✕",
  system: "·",
};

function TaskPane({ id, onStarted }: { id: string; onStarted: (t: TaskSummary) => void }) {
  const task = useTaskStream(id);
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = log.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [task?.events.length]);

  if (!task) return <div className="console-body loading">Connecting…</div>;

  const stop = () => api(`/api/tasks/${id}`, { method: "DELETE" }).catch((e) => setErr(e.message));
  const send = async () => {
    if (!reply.trim()) return;
    setErr(null);
    try {
      const t = await api<TaskSummary>(`/api/tasks/${id}`, { method: "POST", body: JSON.stringify({ prompt: reply }) });
      setReply("");
      onStarted(t);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="console-body">
      <div className="console-meta">
        <span className={`status ${task.status === "running" ? "working" : task.status === "done" ? "done" : task.status === "error" ? "error" : "idle"}`}>
          <i />
          {task.status}
        </span>
        <span>{task.agent ? `@${task.agent}` : "Main session"}</span>
        {task.activeAgents.length > 0 && <span>active: {task.activeAgents.map((a) => "@" + a).join(", ")}</span>}
        {task.model && <span>{task.model}</span>}
        <span>{task.permissionMode}</span>
        <span>{duration(task.durationMs ?? (task.status === "running" ? Date.now() - task.startedAt : undefined))}</span>
        <span>{money(task.costUsd)}</span>
        <span className="grow" />
        {task.status === "running" && (
          <button className="danger small" onClick={stop}>
            ■ Stop
          </button>
        )}
      </div>
      <div
        className="log"
        ref={log}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {task.events.map((ev, i) => (
          <div key={i} className={`ev ev-${ev.kind}`}>
            <span className="ico">{ICON[ev.kind]}</span>
            {ev.agent && <span className="who">@{ev.agent}</span>}
            <span className="txt">{ev.text}</span>
          </div>
        ))}
        {task.status === "running" && <div className="ev ev-system blink">✱ working…</div>}
      </div>
      {task.status !== "running" && task.sessionId && (
        <div className="reply">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Follow up in this session…"
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="primary small" onClick={send} disabled={!reply.trim()}>
            Send
          </button>
        </div>
      )}
      {err && <p className="hint error">{err}</p>}
    </div>
  );
}

export default function Console({ tasks, open, active, onSelect, onClose, onStarted }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return (
    <section className={`console ${collapsed ? "collapsed" : ""}`}>
      <div className="console-tabs">
        {open.map((id) => {
          const t = byId.get(id);
          return (
            <div key={id} className={`ctab ${id === active ? "on" : ""}`} onClick={() => onSelect(id)}>
              <i className={t?.status === "running" ? "live" : t?.status === "error" ? "bad" : ""} />
              <span className="clamp1">{t ? `${t.agent ? "@" + t.agent + " " : ""}${t.title}` : id}</span>
              <button
                aria-label="Close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        <span className="grow" />
        <button className="icon" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "▴" : "▾"}
        </button>
      </div>
      {!collapsed && <TaskPane key={active} id={active} onStarted={onStarted} />}
    </section>
  );
}

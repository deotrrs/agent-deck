"use client";

import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { api } from "./api";
import type { AgentDef, TaskSummary } from "@/lib/types";

const EMPTY = { name: "", description: "", model: "inherit", tools: "", color: "", prompt: "" };
const COLORS = ["", "purple", "blue", "cyan", "green", "yellow", "orange", "red", "pink"];

export default function AgentsView({
  repo,
  agents,
  tasks,
  initial,
  onSaved,
}: {
  repo: string;
  agents: AgentDef[];
  tasks: TaskSummary[];
  initial: string | null;
  onSaved: () => void;
}) {
  const [sel, setSel] = useState<string | null>(initial ?? agents[0]?.name ?? "__new__");
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = agents.find((a) => a.name === sel);

  useEffect(() => {
    if (initial) setSel(initial);
  }, [initial]);

  useEffect(() => {
    setMsg(null);
    if (sel === "__new__" || !current) setForm(EMPTY);
    else
      setForm({
        name: current.name,
        description: current.description,
        model: current.model,
        tools: current.tools.join(", "),
        color: current.color ?? "",
        prompt: current.prompt,
      });
  }, [sel, current]);

  const readOnly = current?.scope === "user";
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setMsg(null);
    try {
      const r = await api<{ name: string }>("/api/agents", {
        method: "POST",
        body: JSON.stringify({ repo, ...form, previousName: current?.scope === "project" ? current.name : undefined }),
      });
      setMsg({ ok: true, text: `Saved .claude/agents/${r.name}.md` });
      setSel(r.name);
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  const runs = (name: string) => tasks.filter((t) => t.agent === name || t.activeAgents.includes(name)).length;

  return (
    <div className="split">
      <aside className="list card">
        <button className={`list-item new ${sel === "__new__" ? "on" : ""}`} onClick={() => setSel("__new__")}>
          ＋ New agent
        </button>
        {agents.map((a) => (
          <button key={a.name} className={`list-item ${sel === a.name ? "on" : ""}`} onClick={() => setSel(a.name)}>
            <Avatar name={a.name} color={a.color} size={32} />
            <div>
              <strong>{a.name}</strong>
              <small>
                {a.scope === "user" ? "user · " : ""}
                {a.model} · {runs(a.name)} runs
              </small>
            </div>
          </button>
        ))}
      </aside>

      <section className="card editor">
        <div className="editor-head">
          <Avatar name={form.name || "new"} color={form.color} size={56} />
          <div>
            <h2>{sel === "__new__" ? "New agent" : form.name}</h2>
            <small>{current ? (current.scope === "user" ? `~/.claude/${current.file} (read-only here)` : current.file) : "Saved to .claude/agents/<name>.md"}</small>
          </div>
        </div>

        <div className="form">
          <label>
            Name
            <input value={form.name} onChange={set("name")} placeholder="e.g. reviewer" disabled={readOnly} />
          </label>
          <label>
            Description <em>Claude reads this to decide when to hand work to the agent</em>
            <textarea rows={2} value={form.description} onChange={set("description")} disabled={readOnly} placeholder="Code reviewer. Use proactively after any code change to review for bugs and style." />
          </label>
          <div className="row3">
            <label>
              Model
              <select value={form.model} onChange={set("model")} disabled={readOnly}>
                <option value="inherit">Default (inherit)</option>
                <option value="opus">Opus</option>
                <option value="sonnet">Sonnet</option>
                <option value="haiku">Haiku</option>
              </select>
            </label>
            <label>
              Color
              <select value={form.color} onChange={set("color")} disabled={readOnly}>
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c || "Auto"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tools <em>blank = all</em>
              <input value={form.tools} onChange={set("tools")} disabled={readOnly} placeholder="Read, Grep, Glob, Bash" />
            </label>
          </div>
          <label>
            System prompt
            <textarea rows={12} className="mono" value={form.prompt} onChange={set("prompt")} disabled={readOnly} placeholder="You are…" />
          </label>
        </div>
        <div className="editor-foot">
          {msg && <span className={msg.ok ? "ok" : "error"}>{msg.text}</span>}
          <span className="grow" />
          {!readOnly && (
            <button className="primary" onClick={save} disabled={!form.name.trim() || !form.description.trim()}>
              Save agent
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

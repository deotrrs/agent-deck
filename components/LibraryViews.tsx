"use client";

import { useState } from "react";
import type { CommandDef, SkillDef } from "@/lib/types";

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty card">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export function CommandsView({ commands, onUse }: { commands: CommandDef[]; onUse: (text: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!commands.length)
    return (
      <Empty title="No slash commands yet">
        Add markdown files to <code>.claude/commands/</code> in this repo (or <code>~/.claude/commands/</code> for all repos).
        Each file becomes a <code>/command</code> you can run from here.
      </Empty>
    );
  return (
    <div className="lib-grid">
      {commands.map((c) => (
        <div key={c.name} className="card lib-item">
          <div className="lib-head">
            <code className="tag">/{c.name}</code>
            {c.scope === "user" && <span className="scope">user</span>}
            <span className="grow" />
            <button className="ghost small" onClick={() => onUse(`/${c.name} `)}>
              Use
            </button>
          </div>
          <p>{c.description || "No description"}</p>
          {c.argumentHint && <small>args: {c.argumentHint}</small>}
          <button className="link" onClick={() => setOpen(open === c.name ? null : c.name)}>
            {open === c.name ? "Hide prompt" : "Show prompt"}
          </button>
          {open === c.name && <pre className="pre">{c.body}</pre>}
        </div>
      ))}
    </div>
  );
}

export function SkillsView({ skills }: { skills: SkillDef[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!skills.length)
    return (
      <Empty title="No skills yet">
        Skills live in <code>.claude/skills/&lt;name&gt;/SKILL.md</code>. Claude loads one automatically when its description
        matches the task.
      </Empty>
    );
  return (
    <div className="lib-grid">
      {skills.map((s) => (
        <div key={s.name} className="card lib-item">
          <div className="lib-head">
            <strong>{s.name}</strong>
            {s.scope === "user" && <span className="scope">user</span>}
          </div>
          <p>{s.description || "No description"}</p>
          <button className="link" onClick={() => setOpen(open === s.name ? null : s.name)}>
            {open === s.name ? "Hide" : "Show SKILL.md"}
          </button>
          {open === s.name && <pre className="pre">{s.body}</pre>}
        </div>
      ))}
    </div>
  );
}

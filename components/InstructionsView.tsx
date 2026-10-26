"use client";

import { useEffect, useState } from "react";
import { api, q } from "./api";

const TEMPLATE = `# Project instructions

## Overview
What this project is and who it's for.

## Commands
- Install: npm install
- Dev: npm run dev
- Test: npm test

## Conventions
- Code style, folder structure, naming.

## Agent workflow
- lead writes a short spec first, dev implements, qa verifies.
`;

export default function InstructionsView({ repo, onSaved }: { repo: string; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [orig, setOrig] = useState("");
  const [exists, setExists] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<{ exists: boolean; content: string }>(`/api/instructions?${q(repo)}`)
      .then((d) => {
        setExists(d.exists);
        setContent(d.content);
        setOrig(d.content);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [repo]);

  const save = async () => {
    try {
      await api("/api/instructions", { method: "PUT", body: JSON.stringify({ repo, content }) });
      setOrig(content);
      setExists(true);
      setMsg({ ok: true, text: "Saved CLAUDE.md" });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <section className="card editor">
      <div className="editor-head">
        <div>
          <h2>CLAUDE.md</h2>
          <small>Read by Claude Code and every agent at the start of each session in this repo.</small>
        </div>
      </div>
      {!exists && !content && (
        <div className="banner">
          This repo has no CLAUDE.md yet.{" "}
          <button className="link" onClick={() => setContent(TEMPLATE)}>
            Start from a template
          </button>
        </div>
      )}
      <textarea className="mono big" value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
      <div className="editor-foot">
        {msg && <span className={msg.ok ? "ok" : "error"}>{msg.text}</span>}
        <span className="grow" />
        <button className="primary" onClick={save} disabled={content === orig}>
          Save
        </button>
      </div>
    </section>
  );
}

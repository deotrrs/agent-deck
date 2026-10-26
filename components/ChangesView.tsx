"use client";

import { useEffect, useState } from "react";
import { api, q } from "./api";
import type { ChangedFile } from "@/lib/types";

const LABEL: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", "??": "new", U: "conflict" };

export default function ChangesView({ repo, running }: { repo: string; running: boolean }) {
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ files: ChangedFile[] }>(`/api/changes?${q(repo)}`)
        .then((d) => alive && setFiles(d.files))
        .catch((e) => alive && setErr(e.message));
    load();
    const id = running ? setInterval(load, 4000) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [repo, running]);

  useEffect(() => {
    if (!sel) return setDiff("");
    api<{ diff: string }>(`/api/changes?${q(repo)}&file=${encodeURIComponent(sel)}`)
      .then((d) => setDiff(d.diff))
      .catch((e) => setDiff(String(e.message)));
  }, [repo, sel, files]);

  if (err) return <div className="banner error">{err}</div>;
  if (!files) return <div className="loading">Reading git status…</div>;
  if (!files.length)
    return (
      <div className="empty card">
        <h2>Working tree is clean</h2>
        <p>Files your agents change will show up here.</p>
      </div>
    );

  const added = files.reduce((n, f) => n + (f.added ?? 0), 0);
  const removed = files.reduce((n, f) => n + (f.removed ?? 0), 0);

  return (
    <div className="split">
      <aside className="list card">
        <div className="list-summary">
          {files.length} files changed <b className="plus">+{added}</b> <b className="minus">−{removed}</b>
        </div>
        {files.map((f) => {
          const code = f.status.replace(/\s/g, "")[0] === "?" ? "??" : f.status.replace(/\s/g, "")[0];
          return (
            <button key={f.path} className={`list-item file ${sel === f.path ? "on" : ""}`} onClick={() => setSel(f.path)}>
              <span className={`fstat s-${code === "??" ? "N" : code}`} title={LABEL[code] ?? f.status}>
                {code === "??" ? "N" : code}
              </span>
              <span className="fpath" title={f.path}>
                <b>{f.path.split("/").pop()}</b> <em>{f.path.split("/").slice(0, -1).join("/")}</em>
              </span>
              {f.added != null && (
                <small>
                  <b className="plus">+{f.added}</b> <b className="minus">−{f.removed}</b>
                </small>
              )}
            </button>
          );
        })}
      </aside>
      <section className="card diff">
        {!sel ? (
          <p className="muted">Pick a file to see its diff.</p>
        ) : (
          <pre>
            {diff.split("\n").map((l, i) => (
              <div
                key={i}
                className={
                  l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : l.startsWith("@@") ? "hunk" : ""
                }
              >
                {l || " "}
              </div>
            ))}
          </pre>
        )}
      </section>
    </div>
  );
}

// Minimal YAML frontmatter reader/writer for Claude Code markdown files.
// Handles `key: value`, quoted values, and simple `- item` lists.

export interface Parsed {
  data: Record<string, string | string[]>;
  body: string;
}

function unquote(v: string): string {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function parseFrontmatter(src: string): Parsed {
  const text = src.replace(/^﻿/, "");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string | string[]> = {};
  let currentKey: string | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentKey) {
      const prev = data[currentKey];
      data[currentKey] = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), unquote(item[1])];
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      data[currentKey] = unquote(kv[2]);
    }
  }
  return { data, body: m[2] };
}

export function str(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(", ");
  return v ?? "";
}

export function list(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v) return [];
  return v
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => unquote(s))
    .filter(Boolean);
}

function needsQuote(v: string) {
  return /[:#\[\]{}&*!|>'"%@`]/.test(v) || v !== v.trim();
}

export function stringifyFrontmatter(data: Record<string, string | undefined>, body: string): string {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => {
      const one = String(v).replace(/\r?\n/g, " ");
      return `${k}: ${needsQuote(one) ? JSON.stringify(one) : one}`;
    });
  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

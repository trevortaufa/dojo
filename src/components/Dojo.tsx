"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AREAS, beltFor, nextSkill, statusOf } from "@/lib/skills";
import { MAX_MASTERY, type Tree } from "@/lib/types";
import { type Rated, SkillDetail } from "./SkillDetail";

// three.js needs a real browser (WebGL), so the hall is never rendered on the server.
const HallScene = dynamic(() => import("./HallScene"), {
  ssr: false,
  loading: () => <Centered>Opening the dojo doors…</Centered>,
});

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-4 text-muted">{children}</div>;
}

export function Dojo() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [goTo, setGoTo] = useState<{ area: string; n: number } | null>(null);
  const [moved, setMoved] = useState(false);

  // Poll so grades Claude records through MCP show up within a few seconds.
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/tree")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((t: Tree) => {
          if (!alive) return;
          setTree((old) => (old?.rev === t.rev ? old : t));
          setError(null);
        })
        .catch((e: Error) => alive && setError(e.message));
    };
    load();
    const timer = setInterval(load, 3000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  // The controls hint goes away once you've moved.
  useEffect(() => {
    if (moved) return;
    const done = () => setMoved(true);
    window.addEventListener("keydown", done, { once: true });
    window.addEventListener("pointerdown", done, { once: true });
    return () => {
      window.removeEventListener("keydown", done);
      window.removeEventListener("pointerdown", done);
    };
  }, [moved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rated = useMemo(
    () => new Map<string, Rated>((tree?.skills ?? []).map((s) => [s.id, { skill: s, status: statusOf(s, tree!.skills) }])),
    [tree],
  );
  const walkTo = useCallback((area: string) => setGoTo((g) => ({ area, n: (g?.n ?? 0) + 1 })), []);

  if (!tree) {
    return <Centered>{error ? `Couldn't load your skills (${error}).` : "Loading your skills…"}</Centered>;
  }

  const mastered = tree.skills.filter((s) => s.mastery >= MAX_MASTERY).length;
  const { belt } = beltFor(mastered, tree.skills.length);
  const suggestion = nextSkill(tree.skills);
  const current = selected ? rated.get(selected) : undefined;
  const areas = [...new Set([...AREAS, ...tree.skills.map((s) => s.area)])].filter((a) => tree.skills.some((s) => s.area === a));

  const pick = (id: string) => {
    const r = rated.get(id);
    if (!r) return;
    walkTo(r.skill.area);
    setSelected(id);
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">
        <HallScene skills={tree.skills} belt={belt} selected={selected} onSelect={setSelected} goTo={goTo} onNear={setNear} />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dojo</h1>
          {near && <p className="text-sm text-muted">{near} · click a skill to study it</p>}
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-1.5 text-sm backdrop-blur">
          <span className="h-2.5 w-8 rounded-sm" style={{ background: belt.color, boxShadow: "0 0 0 1px var(--line)" }} />
          {belt.name}
          <span className="text-muted">· {mastered}/{tree.skills.length}</span>
        </div>
      </header>

      {error && <p className="absolute left-4 top-16 text-sm text-gap">Lost contact with the server ({error}). Retrying…</p>}

      {!moved && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit rounded-lg bg-panel px-4 py-2 text-center text-sm backdrop-blur">
          <b>W A S D</b> to walk · <b>arrow keys</b> or drag to look · click the floor to walk there
        </p>
      )}

      <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
        {suggestion && !current ? (
          <button
            onClick={() => pick(suggestion.id)}
            className="rounded-xl border border-line bg-panel px-4 py-3 text-left text-sm shadow-lg backdrop-blur hover:border-open"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-open">Next lesson</span>
            <span className="block font-medium">{suggestion.title}</span>
            <span className="text-muted">{suggestion.area} · walk me there</span>
          </button>
        ) : (
          <span />
        )}
        <nav className="flex flex-wrap gap-1.5" aria-label="Walk to an area">
          {areas.map((a) => (
            <button
              key={a}
              onClick={() => walkTo(a)}
              className={`rounded-full border px-3 py-1 text-xs backdrop-blur ${
                near === a ? "border-open bg-panel text-foreground" : "border-line bg-panel text-muted hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </nav>
      </div>

      {current && (
        <aside className="absolute inset-x-0 bottom-0 z-10 max-h-[65vh] overflow-y-auto rounded-t-2xl border border-line bg-panel p-4 shadow-2xl backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:top-16 md:max-h-none md:w-80 md:rounded-2xl">
          <SkillDetail star={current} stars={rated} onPick={pick} onClose={() => setSelected(null)} />
        </aside>
      )}
    </main>
  );
}

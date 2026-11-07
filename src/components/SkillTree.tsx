"use client";

import { useEffect, useMemo, useState } from "react";
import { AREAS, beltFor, depthOf, statusOf } from "@/lib/skills";
import { MAX_MASTERY, type Skill, type Status, type Tree, type Verdict } from "@/lib/types";

/* Tree geometry, in pixels. */
const COL = 216;
const ROW = 84;
const NODE_W = 184;
const NODE_H = 64;
const PAD = 16;
const LANE_LABEL = 28;
const LANE_GAP = 12;

const STATUS_LABEL: Record<Status, string> = {
  locked: "Locked",
  open: "Ready to try",
  learning: "Learning",
  mastered: "Mastered",
};
const STATUS_COLOR: Record<Status, string> = {
  locked: "var(--line)",
  open: "var(--open)",
  learning: "var(--learning)",
  mastered: "var(--mastered)",
};
const VERDICT_COLOR: Record<Verdict, string> = {
  gap: "var(--gap)",
  partial: "var(--open)",
  solid: "var(--mastered)",
};

interface Placed {
  skill: Skill;
  status: Status;
  x: number;
  y: number;
}

/** Lays skills out in lanes by area (rows) and prerequisite depth (columns). */
function layout(skills: Skill[]) {
  const areas = [...AREAS, ...new Set(skills.map((s) => s.area).filter((a) => !(AREAS as readonly string[]).includes(a)))];
  const placed = new Map<string, Placed>();
  const lanes: { area: string; top: number; height: number }[] = [];
  let top = PAD;
  let maxDepth = 0;
  for (const area of areas) {
    const inArea = skills.filter((s) => s.area === area);
    if (!inArea.length) continue;
    const stacks = new Map<number, number>();
    for (const skill of inArea) {
      const depth = depthOf(skill.id, skills);
      const slot = stacks.get(depth) ?? 0;
      stacks.set(depth, slot + 1);
      maxDepth = Math.max(maxDepth, depth);
      placed.set(skill.id, { skill, status: statusOf(skill, skills), x: PAD + depth * COL, y: top + LANE_LABEL + slot * ROW });
    }
    const height = LANE_LABEL + Math.max(...stacks.values()) * ROW;
    lanes.push({ area, top, height });
    top += height + LANE_GAP;
  }
  return { placed, lanes, width: PAD * 2 + maxDepth * COL + NODE_W, height: top };
}

function Pips({ mastery, color }: { mastery: number; color: string }) {
  return (
    <span className="flex gap-1" aria-label={`Mastery ${mastery} of ${MAX_MASTERY}`}>
      {Array.from({ length: MAX_MASTERY }, (_, i) => (
        <span
          key={i}
          className="size-2 rounded-full border"
          style={{ borderColor: color, background: i < mastery ? color : "transparent" }}
        />
      ))}
    </span>
  );
}

export function SkillTree() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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

  const view = useMemo(() => (tree ? layout(tree.skills) : null), [tree]);

  if (!tree || !view) {
    return (
      <main className="flex flex-1 items-center justify-center p-4 text-muted">
        {error ? `Couldn't load your skills (${error}).` : "Loading your skills…"}
      </main>
    );
  }

  const mastered = tree.skills.filter((s) => s.mastery >= MAX_MASTERY).length;
  const { belt, next } = beltFor(mastered, tree.skills.length);
  const current = selected ? view.placed.get(selected) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dojo</h1>
          <p className="text-sm text-muted">Master a skill to unlock the ones that build on it.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2 shadow-sm">
          <span className="h-3 w-10 rounded-sm border border-line" style={{ background: belt.color }} />
          <div className="text-sm">
            <div className="font-medium">{belt.name}</div>
            <div className="text-muted">
              {mastered} of {tree.skills.length} mastered
              {next && ` · ${next.at - mastered} to ${next.name.toLowerCase()}`}
            </div>
          </div>
        </div>
      </header>

      {error && <p className="text-sm text-gap">Lost contact with the server ({error}). Retrying…</p>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-surface shadow-sm">
          <div className="relative" style={{ width: view.width, height: view.height }}>
            {view.lanes.map((lane) => (
              <div
                key={lane.area}
                className="absolute inset-x-0 border-t border-line first:border-t-0"
                style={{ top: lane.top - LANE_GAP / 2, height: lane.height + LANE_GAP }}
              >
                <span className="absolute left-4 top-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  {lane.area}
                </span>
              </div>
            ))}

            <svg className="pointer-events-none absolute inset-0" width={view.width} height={view.height}>
              {[...view.placed.values()].flatMap(({ skill, x, y }) =>
                skill.requires.map((req) => {
                  const from = view.placed.get(req);
                  if (!from) return null;
                  const x1 = from.x + NODE_W;
                  const y1 = from.y + NODE_H / 2;
                  const y2 = y + NODE_H / 2;
                  const mid = (x1 + x) / 2;
                  return (
                    <path
                      key={`${req}-${skill.id}`}
                      d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x},${y2}`}
                      fill="none"
                      strokeWidth={2}
                      stroke={from.status === "mastered" ? "var(--mastered)" : "var(--line)"}
                    />
                  );
                }),
              )}
            </svg>

            {[...view.placed.values()].map(({ skill, status, x, y }) => {
              const color = STATUS_COLOR[status];
              const isSelected = skill.id === selected;
              return (
                <button
                  key={skill.id}
                  onClick={() => setSelected(isSelected ? null : skill.id)}
                  className={`absolute flex flex-col justify-between rounded-lg border-2 bg-surface px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    status === "locked" ? "opacity-55" : ""
                  } ${isSelected ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
                  style={{ left: x, top: y, width: NODE_W, height: NODE_H, borderColor: color }}
                >
                  <span className="truncate text-sm font-medium">
                    {status === "locked" && "🔒 "}
                    {skill.title}
                  </span>
                  <span className="flex items-center justify-between text-xs text-muted">
                    {STATUS_LABEL[status]}
                    <Pips mastery={skill.mastery} color={color} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="w-full shrink-0 rounded-xl bg-surface p-4 shadow-sm lg:w-80">
          {current ? <SkillDetail placed={current} all={view.placed} onPick={setSelected} /> : <HowItWorks />}
        </aside>
      </div>
    </main>
  );
}

function HowItWorks() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <h2 className="text-base font-semibold">How the dojo works</h2>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-muted">
        <li>Pick a skill that’s ready to try.</li>
        <li>In Claude Code, type the “grill me” line it shows you.</li>
        <li>Claude asks one question at a time and grades each answer.</li>
        <li>Solid answers fill a pip, gaps empty one. Three pips masters it and unlocks what comes next.</li>
      </ol>
    </div>
  );
}

function SkillDetail({
  placed: { skill, status },
  all,
  onPick,
}: {
  placed: Placed;
  all: Map<string, Placed>;
  onPick: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const prompt = `grill me on ${skill.id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is blocked on plain-http pages; the text is still there to select.
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">{skill.area}</div>
        <h2 className="text-lg font-semibold">{skill.title}</h2>
        <div className="mt-1 flex items-center gap-2 text-muted">
          <Pips mastery={skill.mastery} color={STATUS_COLOR[status]} />
          {STATUS_LABEL[status]}
        </div>
      </div>

      <p>{skill.summary}</p>
      {skill.seenIn && (
        <p className="text-muted">
          <span className="font-medium text-foreground">Seen in:</span> {skill.seenIn}
        </p>
      )}

      {skill.requires.length > 0 && (
        <div>
          <div className="mb-1 font-medium">Builds on</div>
          <ul className="flex flex-col gap-1">
            {skill.requires.map((id) => {
              const req = all.get(id);
              return (
                <li key={id}>
                  <button onClick={() => onPick(id)} className="flex items-center gap-2 hover:underline">
                    <span className="size-2 rounded-full" style={{ background: req ? STATUS_COLOR[req.status] : "var(--line)" }} />
                    {req?.skill.title ?? id}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 font-medium">{status === "locked" ? "Unlock the skills above first, or try it anyway:" : "Get grilled in Claude Code:"}</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 select-all rounded bg-background px-2 py-1 font-mono text-xs">{prompt}</code>
          <button onClick={copy} className="rounded border border-line px-2 py-1 text-xs hover:bg-background">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 font-medium">History</div>
        {skill.history.length === 0 ? (
          <p className="text-muted">No answers graded yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {[...skill.history].reverse().map((a) => (
              <li key={a.at} className="border-l-2 pl-3" style={{ borderColor: VERDICT_COLOR[a.verdict] }}>
                <div className="flex justify-between text-xs text-muted">
                  <span className="font-semibold uppercase" style={{ color: VERDICT_COLOR[a.verdict] }}>
                    {a.verdict}
                  </span>
                  {new Date(a.at).toLocaleDateString()}
                </div>
                <div className="font-medium">{a.question}</div>
                <div className="text-muted">{a.feedback}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

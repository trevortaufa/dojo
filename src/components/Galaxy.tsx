"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGalaxy, cameraFor, DUST, nextStar, type Star, VIEW } from "@/lib/galaxy";
import { beltFor } from "@/lib/skills";
import { MAX_MASTERY, type Tree } from "@/lib/types";
import { SkillDetail, STATUS_COLOR, STATUS_LABEL } from "./SkillDetail";

const STAR_R = 4.5;
const RING_R = 8;
const RING = 2 * Math.PI * RING_R;

export function Galaxy() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The constellation zoomed into, or null for the whole galaxy. */
  const [focus, setFocus] = useState<string | null>(null);
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

  // Escape steps back out: first the open star, then the constellation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) setSelected(null);
      else setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const galaxy = useMemo(() => (tree ? buildGalaxy(tree.skills) : null), [tree]);

  if (!tree || !galaxy) {
    return (
      <main className="flex flex-1 items-center justify-center p-4 text-muted">
        {error ? `Couldn't load your skills (${error}).` : "Charting your galaxy…"}
      </main>
    );
  }

  const focused = galaxy.constellations.find((c) => c.area === focus);
  const zoom = focused?.zoom ?? 1;
  const star = selected ? galaxy.stars.get(selected) : undefined;
  const mastered = tree.skills.filter((s) => s.mastery >= MAX_MASTERY).length;
  const { belt, next } = beltFor(mastered, tree.skills.length);
  const suggestion = nextStar(tree.skills);

  /** Jumps to a star, zooming into its constellation. */
  const pick = (id: string) => {
    const s = galaxy.stars.get(id);
    if (!s) return;
    setFocus(s.skill.area);
    setSelected(id);
  };

  return (
    <main className="relative flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          {focused ? (
            <button
              onClick={() => {
                setFocus(null);
                setSelected(null);
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-white/10"
            >
              ← Galaxy
            </button>
          ) : (
            <h1 className="text-xl font-semibold tracking-tight">Dojo</h1>
          )}
          {focused && (
            <span className="text-sm text-muted">
              <span className="font-semibold text-foreground">{focused.area}</span> · {focused.mastered} of{" "}
              {focused.stars.length} mastered
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm" title={next ? `${next.at - mastered} more to ${next.name.toLowerCase()}` : undefined}>
          <span className="h-2.5 w-9 rounded-sm" style={{ background: belt.color, boxShadow: "0 0 0 1px var(--line)" }} />
          <span>
            {belt.name} <span className="text-muted">· {mastered}/{tree.skills.length}</span>
          </span>
        </div>
      </header>

      {error && <p className="px-4 text-sm text-gap">Lost contact with the server ({error}). Retrying…</p>}

      <div className="relative flex-1">
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          className="block h-full max-h-[calc(100vh-4rem)] w-full"
          role="img"
          aria-label="Skill galaxy"
        >
          <defs>
            <filter id="glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {DUST.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="var(--dust)" />
          ))}

          <g className="camera" style={{ transform: cameraFor(focused) }}>
            {galaxy.links.map(({ from, to, cross }) => {
              const dim = focused && from.skill.area !== focus && to.skill.area !== focus;
              return (
                <line
                  key={`${from.skill.id}-${to.skill.id}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={from.status === "mastered" ? "var(--mastered)" : cross ? "var(--cross)" : "var(--link)"}
                  strokeWidth={1.4}
                  strokeDasharray={cross ? "4 5" : undefined}
                  vectorEffect="non-scaling-stroke"
                  opacity={dim ? 0.12 : cross ? 0.55 : 0.8}
                  className="transition-opacity duration-500"
                />
              );
            })}

            {galaxy.constellations.map((c) => {
              const isFocus = c.area === focus;
              const faded = focused && !isFocus;
              return (
                <g key={c.area} opacity={faded ? 0.18 : 1} className="transition-opacity duration-500">
                  {!isFocus && (
                    <g
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${c.area}`}
                      onClick={() => {
                        setFocus(c.area);
                        setSelected(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (setFocus(c.area), setSelected(null))}
                      className="constellation cursor-pointer outline-none"
                    >
                      <rect {...{ x: c.box.x, y: c.box.y, width: c.box.w, height: c.box.h }} rx={24} className="halo" />
                      {!focused && (
                        <text
                          x={c.box.x + c.box.w / 2}
                          y={c.box.y + c.box.h + 6}
                          textAnchor="middle"
                          className="fill-foreground text-[17px] font-semibold"
                        >
                          {c.area}
                          <tspan className="fill-muted text-[13px] font-normal">
                            {"  "}
                            {c.mastered}/{c.stars.length}
                          </tspan>
                        </text>
                      )}
                    </g>
                  )}
                  {c.stars.map((s) => (
                    <StarMark
                      key={s.skill.id}
                      star={s}
                      zoom={zoom}
                      active={isFocus}
                      selected={s.skill.id === selected}
                      onPick={() => setSelected(s.skill.id === selected ? null : s.skill.id)}
                    />
                  ))}
                </g>
              );
            })}
          </g>
        </svg>

        {!focused && suggestion && (
          <button
            onClick={() => pick(suggestion.id)}
            className="absolute bottom-4 left-4 right-4 rounded-xl border border-line bg-panel px-4 py-3 text-left text-sm shadow-lg backdrop-blur hover:border-open sm:right-auto"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-open">Next star</span>
            <span className="block font-medium">{suggestion.title}</span>
            <span className="text-muted">
              {suggestion.area} · {STATUS_LABEL[galaxy.stars.get(suggestion.id)!.status].toLowerCase()}
            </span>
          </button>
        )}

        {star && (
          <aside className="fixed inset-x-0 bottom-0 z-10 max-h-[65vh] overflow-y-auto rounded-t-2xl border border-line bg-panel p-4 shadow-2xl backdrop-blur md:absolute md:inset-x-auto md:bottom-4 md:right-4 md:top-0 md:max-h-none md:w-80 md:rounded-2xl">
            <SkillDetail star={star} stars={galaxy.stars} onPick={pick} onClose={() => setSelected(null)} />
          </aside>
        )}
      </div>
    </main>
  );
}

function StarMark({
  star: { skill, status, x, y },
  zoom,
  active,
  selected,
  onPick,
}: {
  star: Star;
  zoom: number;
  active: boolean;
  selected: boolean;
  onPick: () => void;
}) {
  const color = STATUS_COLOR[status];
  const label = 13 / zoom;
  return (
    <g
      role={active ? "button" : undefined}
      tabIndex={active ? 0 : undefined}
      aria-label={active ? `${skill.title}, ${STATUS_LABEL[status]}` : undefined}
      onClick={active ? onPick : undefined}
      onKeyDown={active ? (e) => e.key === "Enter" && onPick() : undefined}
      className={`${active ? "cursor-pointer" : "pointer-events-none"} star outline-none`}
    >
      {/* A bigger invisible target, so small stars are easy to click. */}
      <circle cx={x} cy={y} r={RING_R + 6} fill="transparent" />
      {status !== "locked" && skill.mastery > 0 && (
        <circle
          cx={x}
          cy={y}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={1.2}
          strokeDasharray={`${(skill.mastery / MAX_MASTERY) * RING} ${RING}`}
          transform={`rotate(-90 ${x} ${y})`}
        />
      )}
      {selected && <circle cx={x} cy={y} r={RING_R + 3} fill="none" stroke="var(--foreground)" strokeWidth={0.8} />}
      <circle
        cx={x}
        cy={y}
        r={status === "locked" ? STAR_R * 0.7 : STAR_R}
        fill={status === "locked" ? "none" : color}
        stroke={color}
        strokeWidth={status === "locked" ? 1 : 0}
        filter={status === "locked" ? undefined : "url(#glow)"}
        className={status === "open" ? "twinkle" : undefined}
      />
      <text
        x={x}
        y={y + RING_R + label + 2}
        textAnchor="middle"
        fontSize={label}
        className={`fill-foreground transition-opacity duration-500 ${active ? "opacity-100" : "opacity-0"}`}
      >
        {skill.title}
      </text>
    </g>
  );
}

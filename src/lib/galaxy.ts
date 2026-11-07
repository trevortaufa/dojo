import { AREAS, depthOf, statusOf } from "./skills";
import { MAX_MASTERY, type Skill, type Status } from "./types";

/** The galaxy is drawn in these SVG units and scaled to fit the screen. */
export const VIEW = { w: 1000, h: 640 };
const CENTER = { x: VIEW.w / 2, y: VIEW.h / 2 };

/* Spacing between stars inside a constellation, and how far a constellation sits from the centre. */
const STEP_X = 70;
const STEP_Y = 56;
const JITTER = 14;
const ORBIT = { x: 280, y: 170 };
const LABEL_ROOM = 40;

export interface Star {
  skill: Skill;
  status: Status;
  x: number;
  y: number;
}

export interface Constellation {
  area: string;
  stars: Star[];
  mastered: number;
  /** Bounds of its stars, padded for labels. */
  box: { x: number; y: number; w: number; h: number };
  /** Scale that fills the screen with this constellation when zoomed in. */
  zoom: number;
}

export interface Link {
  from: Star;
  to: Star;
  /** Joins two different constellations. */
  cross: boolean;
}

/** A stable number in [-1, 1] from a string, so stars sit slightly off-grid but never move between loads. */
function wobble(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

export function buildGalaxy(skills: Skill[]) {
  const extra = [...new Set(skills.map((s) => s.area))].filter((a) => !(AREAS as readonly string[]).includes(a));
  const areas = [...AREAS, ...extra].filter((a) => skills.some((s) => s.area === a));
  const stars = new Map<string, Star>();

  const constellations: Constellation[] = areas.map((area, i) => {
    // Spread constellations around an ellipse, starting top-left.
    const angle = -0.75 * Math.PI + (i * 2 * Math.PI) / areas.length;
    const cx = areas.length === 1 ? CENTER.x : CENTER.x + ORBIT.x * Math.cos(angle);
    const cy = areas.length === 1 ? CENTER.y : CENTER.y + ORBIT.y * Math.sin(angle);

    // Place column by column, ordering each column by where its parents sit, so lines cross less.
    const depth = new Map(skills.filter((s) => s.area === area).map((s) => [s.id, depthOf(s.id, skills)]));
    const maxDepth = Math.max(...depth.values());
    const slotOf = new Map<string, number>();
    const columns = new Map<number, number>();
    for (const d of depth.values()) columns.set(d, (columns.get(d) ?? 0) + 1);
    const parentSlot = (s: Skill) => {
      const known = s.requires.filter((r) => slotOf.has(r)).map((r) => slotOf.get(r)!);
      return known.length ? known.reduce((a, b) => a + b, 0) / known.length : Infinity;
    };
    const inArea: Skill[] = [];
    for (let d = 0; d <= maxDepth; d++) {
      const column = skills.filter((s) => s.area === area && depth.get(s.id) === d).sort((a, b) => parentSlot(a) - parentSlot(b));
      column.forEach((s, i) => slotOf.set(s.id, i));
      inArea.push(...column);
    }

    const own = inArea.map((skill) => {
      const d = depth.get(skill.id)!;
      const slot = slotOf.get(skill.id)!;
      const star: Star = {
        skill,
        status: statusOf(skill, skills),
        x: cx + (d - maxDepth / 2) * STEP_X + wobble(skill.id, 1) * JITTER,
        y: cy + (slot - ((columns.get(d) ?? 1) - 1) / 2) * STEP_Y + wobble(skill.id, 2) * JITTER,
      };
      stars.set(skill.id, star);
      return star;
    });

    const xs = own.map((s) => s.x);
    const ys = own.map((s) => s.y);
    const box = {
      x: Math.min(...xs) - LABEL_ROOM,
      y: Math.min(...ys) - LABEL_ROOM,
      w: Math.max(...xs) - Math.min(...xs) + LABEL_ROOM * 2,
      h: Math.max(...ys) - Math.min(...ys) + LABEL_ROOM * 2,
    };
    return {
      area,
      stars: own,
      mastered: inArea.filter((s) => s.mastery >= MAX_MASTERY).length,
      box,
      zoom: Math.min((VIEW.w * 0.8) / box.w, (VIEW.h * 0.7) / box.h, 3.2),
    };
  });

  const links: Link[] = [];
  for (const to of stars.values()) {
    for (const req of to.skill.requires) {
      const from = stars.get(req);
      if (from) links.push({ from, to, cross: from.skill.area !== to.skill.area });
    }
  }
  return { constellations, stars, links };
}

/** The CSS transform that centres and enlarges one constellation (or shows the whole galaxy). */
export function cameraFor(c: Constellation | undefined): string {
  if (!c) return "translate(0px, 0px) scale(1)";
  const x = c.box.x + c.box.w / 2;
  const y = c.box.y + c.box.h / 2;
  return `translate(${CENTER.x}px, ${CENTER.y}px) scale(${c.zoom}) translate(${-x}px, ${-y}px)`;
}

/** One skill to suggest next: keep going on one in progress, else the earliest one that's ready. */
export function nextStar(skills: Skill[]): Skill | null {
  const learning = skills.filter((s) => statusOf(s, skills) === "learning");
  if (learning.length) return learning.reduce((a, b) => (b.mastery > a.mastery ? b : a));
  const open = skills.filter((s) => statusOf(s, skills) === "open");
  if (!open.length) return null;
  return open.reduce((a, b) => (depthOf(b.id, skills) < depthOf(a.id, skills) ? b : a));
}

/** Seeded random numbers (mulberry32), so the background is the same on the server and in the browser. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed scatter of background stars. */
const random = seeded(42);
export const DUST = Array.from({ length: 160 }, () => ({
  x: random() * VIEW.w,
  y: random() * VIEW.h,
  r: 0.4 + random() * 1.1,
}));

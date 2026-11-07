import { AREAS, depthOf, statusOf } from "./skills";
import { MAX_MASTERY, type Skill, type Status } from "./types";

/** The hall, in metres: x is left/right, z is front (entrance, +) to back (−). */
export const HALL = { halfW: 8, halfD: 10, height: 5 };
export const EYE = 1.6;
export const START = { x: 0, z: 8.2 };
/** Where scroll centres hang. */
const SCROLL_Y = 2.6;
/** How far in front of a scroll you stand to read it. */
const READ_DISTANCE = 2.4;

/** Places on the walls a scroll can hang, nearest the entrance first; left and right alternate. */
const SLOTS: { x: number; z: number; rotY: number; normal: [number, number] }[] = [];
for (const z of [5, -1, -7]) {
  SLOTS.push({ x: -HALL.halfW + 0.06, z, rotY: Math.PI / 2, normal: [1, 0] });
  SLOTS.push({ x: HALL.halfW - 0.06, z, rotY: -Math.PI / 2, normal: [-1, 0] });
}
for (const x of [-4.5, 4.5]) SLOTS.push({ x, z: -HALL.halfD + 0.06, rotY: 0, normal: [0, 1] });

/** A skill's spot on its scroll, in metres from the scroll's centre. */
export interface Plaque {
  skill: Skill;
  status: Status;
  x: number;
  y: number;
}

export interface Wing {
  area: string;
  plaques: Plaque[];
  mastered: number;
  /** Where the scroll hangs, and which way it faces. */
  position: [number, number, number];
  rotY: number;
  /** The floor spot to stand on to read it. */
  front: { x: number; z: number };
}

/** A red cord between two scrolls: something in one area builds on the other. */
export interface Cord {
  from: Wing;
  to: Wing;
}

/* The part of the paper skills are drawn on. */
const AREA_W = 2.5;
const AREA_TOP = 0.35;
const AREA_BOTTOM = -1.2;

export function buildHall(skills: Skill[]) {
  const extra = [...new Set(skills.map((s) => s.area))].filter((a) => !(AREAS as readonly string[]).includes(a));
  const areas = [...AREAS, ...extra].filter((a) => skills.some((s) => s.area === a)).slice(0, SLOTS.length);

  const wings: Wing[] = areas.map((area, i) => {
    const slot = SLOTS[i];
    return {
      area,
      plaques: placeOnScroll(skills, area),
      mastered: skills.filter((s) => s.area === area && s.mastery >= MAX_MASTERY).length,
      position: [slot.x, SCROLL_Y, slot.z],
      rotY: slot.rotY,
      front: { x: slot.x + slot.normal[0] * READ_DISTANCE, z: slot.z + slot.normal[1] * READ_DISTANCE },
    };
  });

  const byArea = new Map(wings.map((w) => [w.area, w]));
  const seen = new Set<string>();
  const cords: Cord[] = [];
  for (const skill of skills) {
    for (const req of skill.requires) {
      const reqArea = skills.find((s) => s.id === req)?.area;
      const from = reqArea && byArea.get(reqArea);
      const to = byArea.get(skill.area);
      const key = [reqArea, skill.area].sort().join("|");
      if (from && to && from !== to && !seen.has(key)) {
        seen.add(key);
        cords.push({ from, to });
      }
    }
  }
  return { wings, cords };
}

/** Columns by prerequisite depth; each column ordered by where its parents sit, so lines cross less. */
function placeOnScroll(skills: Skill[], area: string): Plaque[] {
  const own = skills.filter((s) => s.area === area);
  const depth = new Map(own.map((s) => [s.id, depthOf(s.id, skills)]));
  const maxDepth = Math.max(...depth.values());
  const columns: Skill[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const s of own) columns[depth.get(s.id)!].push(s);

  const slotOf = new Map<string, number>();
  const parentSlot = (s: Skill) => {
    const known = s.requires.filter((r) => slotOf.has(r)).map((r) => slotOf.get(r)!);
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : Infinity;
  };
  const tallest = Math.max(...columns.map((c) => c.length));
  const rowStep = Math.min(0.55, (AREA_TOP - AREA_BOTTOM) / tallest);
  const mid = (AREA_TOP + AREA_BOTTOM) / 2;

  const plaques: Plaque[] = [];
  columns.forEach((column, d) => {
    column.sort((a, b) => parentSlot(a) - parentSlot(b));
    column.forEach((skill, i) => {
      slotOf.set(skill.id, i);
      plaques.push({
        skill,
        status: statusOf(skill, skills),
        x: maxDepth === 0 ? 0 : -AREA_W / 2 + (d * AREA_W) / maxDepth,
        y: mid - (i - (column.length - 1) / 2) * rowStep,
      });
    });
  });
  return plaques;
}

/** Keeps a floor point inside the walls, with room to stand. */
export function clampToHall(x: number, z: number) {
  const m = 0.7;
  return {
    x: Math.max(-HALL.halfW + m, Math.min(HALL.halfW - m, x)),
    z: Math.max(-HALL.halfD + m, Math.min(HALL.halfD - m, z)),
  };
}

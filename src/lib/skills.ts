import { type Attempt, MAX_MASTERY, type Skill, type Status, type Tree, type Verdict } from "./types";

/** Areas in the order they're drawn, top to bottom. */
export const AREAS = ["Git", "Web", "Data", "Concurrency"] as const;

type Seed = Omit<Skill, "mastery" | "history">;

/** The starting tree: concepts that came up while building JARVIS and shipping the ShoWare work. */
const SEED: Seed[] = [
  { id: "git-basics", title: "Commits & staging", area: "Git", requires: [],
    summary: "A commit is a saved snapshot; staging picks what goes into it." },
  { id: "git-branching", title: "Branching", area: "Git", requires: ["git-basics"],
    summary: "A branch is a movable pointer, so work can happen without touching main.",
    seenIn: "JARVIS: branch → merge → delete for every change" },
  { id: "merge-conflicts", title: "Merge conflicts", area: "Git", requires: ["git-branching"],
    summary: "Two branches changed the same lines, and git needs a human to choose." },
  { id: "pull-requests", title: "Pull requests", area: "Git", requires: ["git-branching"],
    summary: "A request to merge a branch, where teammates review the change first.",
    seenIn: "ShoWare: PR #15 and PR #19 reviewed by Thaddeus" },
  { id: "release-flow", title: "dev → main releases", area: "Git", requires: ["pull-requests"],
    summary: "Features collect in dev and reach main (production) together in a release.",
    seenIn: "ShoWare: Buy More merged to dev, waiting on the next release" },

  { id: "http-basics", title: "HTTP requests", area: "Web", requires: [],
    summary: "A client sends a method, URL and body; the server replies with a status code and body." },
  { id: "client-server", title: "Client vs server", area: "Web", requires: [],
    summary: "Some code runs in the browser and some on the server, with different powers and secrets." },
  { id: "env-vars", title: "Environment variables", area: "Web", requires: ["client-server"],
    summary: "Settings and secrets passed in from outside the code, different on each machine.",
    seenIn: "JARVIS: JARVIS_DATA_DIR in .env.local" },
  { id: "rest-apis", title: "REST APIs", area: "Web", requires: ["http-basics"],
    summary: "URLs name resources and HTTP methods say what to do with them.",
    seenIn: "JARVIS: PATCH /api/board" },
  { id: "server-components", title: "Server & client components", area: "Web", requires: ["client-server"],
    summary: "React components that render on the server versus ones that run in the browser." },

  { id: "json-storage", title: "JSON file storage", area: "Data", requires: [],
    summary: "Saving app state as a JSON file: simple, but no queries and no safe concurrent writes.",
    seenIn: "JARVIS: board.json in OneDrive" },
  { id: "sql-basics", title: "SQL & relational data", area: "Data", requires: [],
    summary: "Tables of rows linked by keys, queried with SELECT and JOIN." },
  { id: "indexing", title: "Database indexes", area: "Data", requires: ["sql-basics"],
    summary: "A sorted lookup structure that makes reads fast and writes a little slower." },
  { id: "caching", title: "Caching", area: "Data", requires: ["http-basics"],
    summary: "Keeping a copy of a result so you don't redo the work, at the risk of it going stale.",
    seenIn: "JARVIS: clearing .next fixed the reload loop" },

  { id: "async-await", title: "async / await", area: "Concurrency", requires: [],
    summary: "Writing code that waits for slow work (files, network) without freezing everything else." },
  { id: "race-conditions", title: "Race conditions", area: "Concurrency", requires: ["async-await"],
    summary: "A bug where the result depends on which of two things happens first." },
  { id: "locking", title: "Locks", area: "Concurrency", requires: ["race-conditions"],
    summary: "Making others wait their turn so only one writer touches shared data at a time.",
    seenIn: "JARVIS: the board.lock folder around every save" },
];

export function seedTree(): Tree {
  return { skills: SEED.map((s) => ({ ...s, mastery: 0, history: [] })), rev: 0 };
}

export function statusOf(skill: Skill, skills: Skill[]): Status {
  if (skill.mastery >= MAX_MASTERY) return "mastered";
  const locked = skill.requires.some((id) => (skills.find((s) => s.id === id)?.mastery ?? 0) < MAX_MASTERY);
  if (locked) return "locked";
  return skill.mastery > 0 ? "learning" : "open";
}

/** Solid answers earn a level, gaps lose one, partial answers hold steady. */
export function applyVerdict(mastery: number, verdict: Verdict): number {
  const step = verdict === "solid" ? 1 : verdict === "gap" ? -1 : 0;
  return Math.min(MAX_MASTERY, Math.max(0, mastery + step));
}

export function recordAttempt(tree: Tree, id: string, attempt: Attempt): Tree {
  return {
    ...tree,
    skills: tree.skills.map((s) =>
      s.id === id ? { ...s, mastery: applyVerdict(s.mastery, attempt.verdict), history: [...s.history, attempt] } : s,
    ),
  };
}

/** How many steps of prerequisites sit before a skill; its column in the tree. */
export function depthOf(id: string, skills: Skill[], seen = new Set<string>()): number {
  const skill = skills.find((s) => s.id === id);
  if (!skill || seen.has(id)) return 0;
  seen.add(id);
  const parents = skill.requires.map((r) => depthOf(r, skills, new Set(seen)));
  return parents.length ? Math.max(...parents) + 1 : 0;
}

export interface Belt {
  name: string;
  color: string;
  /** Mastered skills needed for this belt. */
  at: number;
}

/** Rank by share of the tree mastered, so adding skills doesn't hand out belts for free. */
export function beltFor(mastered: number, total: number): { belt: Belt; next: Belt | null } {
  const belts: Belt[] = [
    { name: "White belt", color: "#e5e7eb", at: 0 },
    { name: "Yellow belt", color: "#facc15", at: 0.15 },
    { name: "Green belt", color: "#22c55e", at: 0.35 },
    { name: "Blue belt", color: "#3b82f6", at: 0.55 },
    { name: "Brown belt", color: "#92400e", at: 0.75 },
    { name: "Black belt", color: "#111827", at: 1 },
  ].map((b, i) => ({ ...b, at: Math.max(i, Math.ceil(b.at * total)) }));
  const index = belts.findLastIndex((b) => mastered >= b.at);
  return { belt: belts[index], next: belts[index + 1] ?? null };
}

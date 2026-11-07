/** How well a grilling answer held up. */
export type Verdict = "gap" | "partial" | "solid";

/** One question Claude asked about a skill, and how the answer went. */
export interface Attempt {
  /** ISO timestamp. */
  at: string;
  question: string;
  verdict: Verdict;
  /** What was missing or wrong, so the next attempt can aim at it. */
  feedback: string;
}

export interface Skill {
  /** Short slug, e.g. "git-branching". */
  id: string;
  title: string;
  area: string;
  /** One line: what it is, in plain English. */
  summary: string;
  /** Skills that should be mastered first. */
  requires: string[];
  /** Where this came up in real work, so it isn't abstract. */
  seenIn?: string;
  /** 0 = not tried, 1–2 = learning, 3 = mastered. */
  mastery: number;
  history: Attempt[];
}

/** A grilling happening right now in Claude Code, so the dojo can show it live. */
export interface Session {
  skill: string;
  /** The question waiting for an answer. */
  question: string;
  /** How many questions have been asked so far. */
  asked: number;
  /** How the previous answer was graded. */
  last?: { verdict: Verdict; feedback: string };
  /** ISO timestamp of the last change; a session left alone too long counts as abandoned. */
  updatedAt: string;
}

export interface Tree {
  skills: Skill[];
  /** Bumped on every save. */
  rev: number;
  session?: Session | null;
}

export type Status = "locked" | "open" | "learning" | "mastered";

export const MAX_MASTERY = 3;

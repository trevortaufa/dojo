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
  /** Where the answer came from. Missing on older attempts, which were all grilling in Claude Code. */
  source?: "grill" | "quiz" | "written";
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

/** How the user answered an exercise in the app, and how it was graded. */
export interface Response {
  /** ISO timestamp of the answer. */
  at: string;
  /** Quiz: the index of the option picked. */
  choice?: number;
  /** Written: what the user typed. */
  text?: string;
  /** Set straight away for quizzes; set by Claude (through MCP) for written answers. */
  verdict?: Verdict;
  feedback?: string;
}

interface BaseExercise {
  /** Unique id, e.g. "git-branching-quiz-1". */
  id: string;
  /** The skill it practises. */
  skill: string;
  prompt: string;
  response?: Response;
}

/** Pick one option. Graded in the app the moment you answer. */
export interface QuizExercise extends BaseExercise {
  kind: "quiz";
  options: string[];
  /** Index of the right option. Stripped before an unanswered quiz is sent to the browser. */
  answer?: number;
  /** Why the right option is right. Also hidden until answered. */
  explain?: string;
}

/** Explain in your own words. Saved in the app, graded later by Claude through MCP. */
export interface WrittenExercise extends BaseExercise {
  kind: "written";
  /** Optional nudge on what a good answer covers. */
  hint?: string;
}

export type Exercise = QuizExercise | WrittenExercise;

export interface Tree {
  skills: Skill[];
  /** Missing in trees saved before exercises existed; filled from the seed on load. */
  exercises?: Exercise[];
  /** Bumped on every save. */
  rev: number;
}

export type Status = "locked" | "open" | "learning" | "mastered";

export const MAX_MASTERY = 3;
/** Quizzes alone can't master a skill: the last level needs an explained answer. */
export const QUIZ_CAP = MAX_MASTERY - 1;

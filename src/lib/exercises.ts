import { recordAttempt } from "./skills";
import {
  type Exercise,
  MAX_MASTERY,
  QUIZ_CAP,
  type QuizExercise,
  type Tree,
  type Verdict,
  type WrittenExercise,
} from "./types";

type QuizSeed = Pick<QuizExercise, "prompt" | "options"> & { answer: number; explain: string };
type WrittenSeed = Pick<WrittenExercise, "prompt" | "hint">;

/** One quiz and one written exercise per starting skill. Claude can add more through MCP. */
const SEED: Record<string, { quiz: QuizSeed; written: WrittenSeed }> = {
  "git-basics": {
    quiz: {
      prompt: "You edited three files but only want two of them in the next commit. What do you do?",
      options: [
        "Commit everything, then delete the third file",
        "Stage only the two files with git add, then commit",
        "Make a new branch for the third file first",
        "Run git commit -a and untick the file",
      ],
      answer: 1,
      explain:
        "Staging is how you choose what goes into a commit. git add puts a file in the next snapshot; anything unstaged stays as a local change.",
    },
    written: {
      prompt: "Why does git have a staging area at all, instead of just committing every changed file?",
      hint: "Think about a commit as a story someone reads later.",
    },
  },
  "git-branching": {
    quiz: {
      prompt: "In JARVIS you make a branch, commit on it, then switch back to master. What happened to master?",
      options: [
        "Nothing: master still points at the commit it pointed at before",
        "It now includes your branch's commits",
        "It was copied, so the repo is twice as big",
        "It was locked until you merge",
      ],
      answer: 0,
      explain:
        "A branch is just a movable pointer to a commit. Committing moves only the branch you're on; master stays put until you merge.",
    },
    written: {
      prompt:
        "Your JARVIS habit is branch, merge, delete for every change, even solo. What does that buy you, given that nobody reviews the branch?",
    },
  },
  "merge-conflicts": {
    quiz: {
      prompt: "When does git stop a merge with a conflict?",
      options: [
        "Whenever both branches changed the same file",
        "When both branches changed the same lines, or one edited what the other deleted",
        "When the branches are more than 10 commits apart",
        "Whenever a file was renamed",
      ],
      answer: 1,
      explain:
        "Git merges different parts of the same file on its own. It only stops when both sides touched the same lines (or one deleted what the other changed), because then only a human can choose.",
    },
    written: {
      prompt: "You resolve a conflict by keeping both versions of a block. The file compiles. Why isn't that proof the merge is right?",
    },
  },
  "pull-requests": {
    quiz: {
      prompt: "What is the main job of a pull request on a team like ShoWare's?",
      options: [
        "Back up your branch to GitHub",
        "Run the code on the production server",
        "Let teammates review a change before it merges",
        "Squash all your commits into one",
      ],
      answer: 2,
      explain: "A PR is a request to merge with a review step in the middle. CI and squashing are often attached to PRs, but review is the point.",
    },
    written: {
      prompt:
        "A reviewer asks on your PR why you made a choice. What makes a good reply, and when should the answer go into the code instead of the comment?",
    },
  },
  "release-flow": {
    quiz: {
      prompt: "Buy More is merged into dev. When do customers see it?",
      options: [
        "Immediately, because it is merged",
        "When dev is released to main, which is what production runs",
        "When you delete the feature branch",
        "When the PR is closed",
      ],
      answer: 1,
      explain: "dev collects finished features; main is what production deploys. A feature reaches users when a release moves dev into main.",
    },
    written: {
      prompt: "Why would a team batch features in dev and release them together, instead of shipping each PR straight to main?",
    },
  },
  "http-basics": {
    quiz: {
      prompt: "A request to update a note fails because the note id doesn't exist. Which status code fits best?",
      options: ["200 OK", "404 Not Found", "500 Internal Server Error", "301 Moved Permanently"],
      answer: 1,
      explain: "4xx codes mean the client asked for something wrong; 404 says the resource isn't there. 500 would blame the server for a client mistake.",
    },
    written: {
      prompt: "What is the difference between a 4xx and a 5xx status code, and why does it matter to whoever is calling your API?",
    },
  },
  "client-server": {
    quiz: {
      prompt: "Where is it safe to use a secret API key in a Next.js app?",
      options: [
        "In a client component, if the variable is named carefully",
        "Only in code that runs on the server, like a route handler",
        "Anywhere, as long as it's in .env.local",
        "In localStorage after the first load",
      ],
      answer: 1,
      explain: "Anything that runs in the browser can be read by whoever is using it. Secrets have to stay in server code that only sends results back.",
    },
    written: {
      prompt:
        "Dojo hides a quiz's right answer until you've picked one. Why must that happen on the server, and what would go wrong if the browser hid it instead?",
    },
  },
  "env-vars": {
    quiz: {
      prompt: "Why is JARVIS_DATA_DIR set in .env.local instead of written into the code?",
      options: [
        "Environment variables make the code run faster",
        "Each machine can point at its own folder without changing the code",
        "Next.js refuses to read paths written in code",
        "So it is visible to the browser",
      ],
      answer: 1,
      explain: "Config that differs per machine (paths, keys, URLs) lives outside the code, so the same commit runs on your work and personal PCs.",
    },
    written: {
      prompt: ".env.local is in .gitignore. Explain why, and what a new teammate would need instead to get the app running.",
    },
  },
  "rest-apis": {
    quiz: {
      prompt: "JARVIS changes one field of a note. Which method fits REST best?",
      options: ["GET /api/board", "DELETE /api/board", "PATCH /api/board", "POST /api/board/get"],
      answer: 2,
      explain: "PATCH means change part of a resource. PUT replaces the whole thing, POST creates, GET only reads.",
    },
    written: {
      prompt: "Why should a GET request never change data? Give a concrete thing that could break if it did.",
      hint: "Think about browsers, caches and link previews.",
    },
  },
  "server-components": {
    quiz: {
      prompt: "A component needs useState and an onClick handler. What must it be?",
      options: [
        "A server component",
        'A client component, marked with "use client"',
        "A route handler",
        "Either; Next decides at build time",
      ],
      answer: 1,
      explain: "State and event handlers only exist in the browser, so the component has to be shipped there as a client component.",
    },
    written: {
      prompt: 'Why not just mark every component "use client"? What do you give up?',
    },
  },
  "json-storage": {
    quiz: {
      prompt: "What is the biggest risk of storing JARVIS's board as one JSON file?",
      options: [
        "JSON can't hold nested data",
        "Two writers at once can overwrite each other's changes",
        "JSON files can't be larger than 1 MB",
        "Git can't track JSON",
      ],
      answer: 1,
      explain:
        "A JSON file has no built-in protection for concurrent writes. Two processes can read the same old copy and the last save wins. That's why JARVIS has a lock.",
    },
    written: {
      prompt: "At what point would you move JARVIS's board from a JSON file into a real database? Name the signals you'd look for.",
    },
  },
  "sql-basics": {
    quiz: {
      prompt: "You want every order together with its customer's name. What do you use?",
      options: ["GROUP BY", "A JOIN on the customer id", "ORDER BY", "Two separate SELECT * queries"],
      answer: 1,
      explain: "A JOIN matches rows across tables on a key, here the customer id stored on each order.",
    },
    written: {
      prompt: "Why store the customer id on each order instead of copying the customer's name onto it?",
      hint: "What happens when the customer changes their name?",
    },
  },
  indexing: {
    quiz: {
      prompt: "What does adding an index usually cost you?",
      options: ["Nothing", "Slower writes and extra storage", "Slower reads", "You can no longer update the column"],
      answer: 1,
      explain: "Every insert or update also has to maintain the index, and the index takes space. Reads on that column get much faster in return.",
    },
    written: {
      prompt: "Without an index, finding a row by email means checking every row. Explain why an index makes that fast, using Big-O.",
    },
  },
  caching: {
    quiz: {
      prompt: "Clearing the .next folder fixed JARVIS's reload loop. What does that suggest?",
      options: [
        "The code had a syntax error",
        "A stale cached build was being served",
        "The browser was out of memory",
        "The JSON file was corrupt",
      ],
      answer: 1,
      explain: ".next holds cached build output. Deleting it forced a fresh build, so the problem was a cached copy that no longer matched the code.",
    },
    written: {
      prompt: 'People joke that "cache invalidation" is one of the two hard things in computer science. Why is it hard?',
    },
  },
  "async-await": {
    quiz: {
      prompt: "What does `await fs.readFile(file)` do to the rest of the server while it waits?",
      options: [
        "Freezes everything until the file is read",
        "Lets other work run, then resumes this function when the file is ready",
        "Starts a new thread for the file",
        "Reads the file in the browser",
      ],
      answer: 1,
      explain: "await pauses only this function. The event loop keeps handling other requests and comes back when the read finishes.",
    },
    written: {
      prompt: "You forget an await before saving the board, and the response is sent. What could the user see, and why?",
    },
  },
  "race-conditions": {
    quiz: {
      prompt: "The app and the MCP server both read skills.json, change it and save it at the same moment. What can happen?",
      options: [
        "Both changes are always kept",
        "One change silently overwrites the other",
        "The file is deleted",
        "Node throws an error every time",
      ],
      answer: 1,
      explain: "Both read the same old version; whoever saves last wins and the other change is lost. That's a classic lost-update race condition.",
    },
    written: {
      prompt: "Why are race conditions so hard to catch in testing? What makes them different from an ordinary bug?",
    },
  },
  locking: {
    quiz: {
      prompt: "JARVIS uses mkdir on a board.lock folder as its lock. Why mkdir?",
      options: [
        "Folders are faster to write than files",
        "mkdir either creates the folder or fails if it exists, in one step nobody can interrupt",
        "Windows can't lock files",
        "So the lock shows up in OneDrive",
      ],
      answer: 1,
      explain: "Creating a folder is atomic: check and create happen as one step. Two processes can't both succeed, so exactly one holds the lock.",
    },
    written: {
      prompt: "The lock code deletes a lock older than 5 seconds. Why is that needed, and what is the risk of doing it?",
    },
  },
};

function seedExercises(): Exercise[] {
  return Object.entries(SEED).flatMap(([skill, { quiz, written }]): Exercise[] => [
    { id: `${skill}-quiz-1`, skill, kind: "quiz", ...quiz },
    { id: `${skill}-written-1`, skill, kind: "written", ...written },
  ]);
}

/** Adds any seed exercises the tree doesn't have yet. Returns the same object when nothing changed. */
export function withSeedExercises(tree: Tree): Tree {
  const have = new Set((tree.exercises ?? []).map((e) => e.id));
  const skills = new Set(tree.skills.map((s) => s.id));
  const missing = seedExercises().filter((e) => !have.has(e.id) && skills.has(e.skill));
  if (!missing.length && tree.exercises) return tree;
  return { ...tree, exercises: [...(tree.exercises ?? []), ...missing] };
}

/** The tree as the browser may see it: unanswered quizzes lose their answer and explanation. */
export function publicTree(tree: Tree): Tree {
  return {
    ...tree,
    exercises: (tree.exercises ?? []).map((e): Exercise => {
      if (e.kind !== "quiz" || e.response) return e;
      return { id: e.id, skill: e.skill, kind: e.kind, prompt: e.prompt, options: e.options };
    }),
  };
}

/** A mistake by the caller (bad id, already answered), as opposed to a bug. `status` is the HTTP code to answer with. */
export class AnswerError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

function findExercise(tree: Tree, id: string): Exercise {
  const exercise = tree.exercises?.find((e) => e.id === id);
  if (!exercise) throw new AnswerError(`No exercise "${id}".`, 404);
  return exercise;
}

function replaceExercise(tree: Tree, exercise: Exercise): Tree {
  return { ...tree, exercises: (tree.exercises ?? []).map((e) => (e.id === exercise.id ? exercise : e)) };
}

/**
 * Saves an answer from the app. A quiz is graded on the spot and counts toward mastery,
 * but only up to QUIZ_CAP: the last level needs an answer in your own words.
 * A written answer is saved as pending until Claude grades it.
 */
export function answerExercise(tree: Tree, id: string, answer: { choice?: number; text?: string }): Tree {
  const exercise = findExercise(tree, id);
  if (exercise.response) throw new AnswerError("Already answered.", 409);
  const at = new Date().toISOString();

  if (exercise.kind === "written") {
    const text = answer.text?.trim();
    if (!text) throw new AnswerError("Write an answer first.", 400);
    return replaceExercise(tree, { ...exercise, response: { at, text } });
  }

  const choice = answer.choice;
  if (choice === undefined || !Number.isInteger(choice) || choice < 0 || choice >= exercise.options.length) {
    throw new AnswerError("Pick one of the options.", 400);
  }
  const right = choice === exercise.answer;
  const verdict: Verdict = right ? "solid" : "gap";
  const explain = exercise.explain ?? "";
  const feedback = right ? explain || "Correct." : `You picked "${exercise.options[choice]}". ${explain}`.trim();
  const graded = replaceExercise(tree, { ...exercise, response: { at, choice, verdict, feedback } });
  return recordAttempt(
    graded,
    exercise.skill,
    { at, question: exercise.prompt, verdict, feedback, source: "quiz" },
    right ? QUIZ_CAP : MAX_MASTERY,
  );
}

/** Written answers waiting for Claude. */
export function pendingAnswers(tree: Tree): WrittenExercise[] {
  return (tree.exercises ?? []).filter(
    (e): e is WrittenExercise => e.kind === "written" && !!e.response && !e.response.verdict,
  );
}

/** Claude's grade for a written answer: stored on the exercise and counted toward mastery. */
export function gradeWritten(tree: Tree, id: string, verdict: Verdict, feedback: string): Tree {
  const exercise = findExercise(tree, id);
  if (exercise.kind !== "written" || !exercise.response) throw new AnswerError(`"${id}" has no written answer to grade.`, 409);
  if (exercise.response.verdict) throw new AnswerError(`"${id}" is already graded.`, 409);
  const graded = replaceExercise(tree, { ...exercise, response: { ...exercise.response, verdict, feedback } });
  return recordAttempt(graded, exercise.skill, {
    at: new Date().toISOString(),
    question: exercise.prompt,
    verdict,
    feedback,
    source: "written",
  });
}

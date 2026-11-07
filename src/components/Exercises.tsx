"use client";

import { useState } from "react";
import type { Exercise, QuizExercise, Verdict, WrittenExercise } from "@/lib/types";

export type Answer = { choice: number } | { text: string };
/** Sends an answer; resolves to an error message, or null when it was saved. */
export type OnAnswer = (exercise: string, answer: Answer) => Promise<string | null>;

export const VERDICT_COLOR: Record<Verdict, string> = {
  gap: "var(--gap)",
  partial: "var(--open)",
  solid: "var(--mastered)",
};

export const GRADE_PROMPT = "grade my dojo answers";

/** The practice list for one skill: what's left to answer first, then what's done. */
export function Exercises({ exercises, onAnswer }: { exercises: Exercise[]; onAnswer: OnAnswer }) {
  if (!exercises.length) {
    return <p className="text-muted">No exercises yet. Ask Claude to add some for this skill.</p>;
  }
  const todo = exercises.filter((e) => !e.response);
  const done = exercises.filter((e) => e.response);
  return (
    <div className="flex flex-col gap-3">
      {todo.length === 0 && <p className="text-muted">All answered. Ask Claude in Claude Code to add more for this skill.</p>}
      {todo.map((e) => (
        <Card key={e.id} exercise={e} onAnswer={onAnswer} />
      ))}
      {done.length > 0 && (
        <details open={todo.length === 0}>
          <summary className="cursor-pointer text-muted hover:text-foreground">Answered ({done.length})</summary>
          <div className="mt-2 flex flex-col gap-3">
            {done.map((e) => (
              <Card key={e.id} exercise={e} onAnswer={onAnswer} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Card({ exercise, onAnswer }: { exercise: Exercise; onAnswer: OnAnswer }) {
  const verdict = exercise.response?.verdict;
  return (
    <div className="rounded-lg border border-line p-3" style={verdict ? { borderLeft: `3px solid ${VERDICT_COLOR[verdict]}` } : undefined}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
        {exercise.kind === "quiz" ? "Quiz" : "Explain it"}
      </div>
      <p className="mb-2 font-medium">{exercise.prompt}</p>
      {exercise.kind === "quiz" ? <Quiz exercise={exercise} onAnswer={onAnswer} /> : <Written exercise={exercise} onAnswer={onAnswer} />}
    </div>
  );
}

function Quiz({ exercise, onAnswer }: { exercise: QuizExercise; onAnswer: OnAnswer }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = exercise.response;

  const pick = async (choice: number) => {
    setBusy(choice);
    setError(await onAnswer(exercise.id, { choice }));
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {exercise.options.map((option, i) => {
        const right = r && i === exercise.answer;
        const wrongPick = r && i === r.choice && !right;
        return (
          <button
            key={i}
            disabled={!!r || busy !== null}
            onClick={() => pick(i)}
            className={`rounded border px-2 py-1.5 text-left ${r ? "" : "hover:border-open hover:bg-white/5"} ${
              busy === i ? "opacity-60" : ""
            }`}
            style={{
              borderColor: right ? "var(--mastered)" : wrongPick ? "var(--gap)" : "var(--line)",
              color: r && !right && !wrongPick ? "var(--muted)" : undefined,
            }}
          >
            {right ? "✓ " : wrongPick ? "✗ " : ""}
            {option}
          </button>
        );
      })}
      {r?.verdict && <Feedback verdict={r.verdict} text={exercise.explain ?? r.feedback ?? ""} />}
      {error && <p className="text-gap">{error}</p>}
    </div>
  );
}

function Written({ exercise, onAnswer }: { exercise: WrittenExercise; onAnswer: OnAnswer }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = exercise.response;

  if (r) {
    return (
      <div className="flex flex-col gap-2">
        <p className="whitespace-pre-wrap rounded bg-black/20 px-2 py-1.5">{r.text}</p>
        {r.verdict ? <Feedback verdict={r.verdict} text={r.feedback ?? ""} /> : <Waiting />}
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    const err = await onAnswer(exercise.id, { text });
    setError(err);
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {exercise.hint && <p className="text-muted">Hint: {exercise.hint}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="In your own words, as if explaining it in code review…"
        className="resize-y rounded border border-line bg-black/20 px-2 py-1.5 outline-none focus:border-open"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Claude grades this later.</span>
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded border border-open px-3 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Submit"}
        </button>
      </div>
      {error && <p className="text-gap">{error}</p>}
    </div>
  );
}

function Feedback({ verdict, text }: { verdict: Verdict; text: string }) {
  return (
    <p>
      <span className="font-semibold uppercase" style={{ color: VERDICT_COLOR[verdict] }}>
        {verdict}
      </span>{" "}
      <span className="text-muted">{text}</span>
    </p>
  );
}

function Waiting() {
  return (
    <p className="text-muted">
      Waiting for Claude. In Claude Code, say <code className="rounded bg-black/30 px-1 font-mono text-xs">{GRADE_PROMPT}</code>.
    </p>
  );
}

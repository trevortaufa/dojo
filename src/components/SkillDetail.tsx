"use client";

import { useState } from "react";
import { MAX_MASTERY, type Skill, type Status, type Verdict } from "@/lib/types";

/** A skill with its current status. */
export interface Rated {
  skill: Skill;
  status: Status;
}

export const STATUS_LABEL: Record<Status, string> = {
  locked: "Locked",
  open: "Ready to try",
  learning: "Learning",
  mastered: "Mastered",
};
export const STATUS_COLOR: Record<Status, string> = {
  locked: "var(--locked)",
  open: "var(--open)",
  learning: "var(--learning)",
  mastered: "var(--mastered)",
};
const VERDICT_COLOR: Record<Verdict, string> = {
  gap: "var(--gap)",
  partial: "var(--open)",
  solid: "var(--mastered)",
};

export function Pips({ mastery, color }: { mastery: number; color: string }) {
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

export function SkillDetail({
  star: { skill, status },
  stars,
  onPick,
  onClose,
}: {
  star: Rated;
  stars: Map<string, Rated>;
  onPick: (id: string) => void;
  onClose: () => void;
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">{skill.area}</div>
          <h2 className="text-lg font-semibold">{skill.title}</h2>
          <div className="mt-1 flex items-center gap-2 text-muted">
            <Pips mastery={skill.mastery} color={STATUS_COLOR[status]} />
            {STATUS_LABEL[status]}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded px-2 text-lg text-muted hover:text-foreground">
          ×
        </button>
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
              const req = stars.get(id);
              return (
                <li key={id}>
                  <button onClick={() => onPick(id)} className="flex items-center gap-2 hover:underline">
                    <span className="size-2 rounded-full" style={{ background: req ? STATUS_COLOR[req.status] : "var(--locked)" }} />
                    {req?.skill.title ?? id}
                    {req && req.skill.area !== skill.area && <span className="text-muted">· {req.skill.area}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-line p-3">
        <div className="mb-2 font-medium">
          {status === "locked" ? "Master what it builds on first, or try it anyway:" : "Get grilled in Claude Code:"}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 select-all rounded bg-black/30 px-2 py-1 font-mono text-xs">{prompt}</code>
          <button onClick={copy} className="rounded border border-line px-2 py-1 text-xs hover:bg-white/10">
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

/**
 * MCP server for the dojo skill tree, so Claude can grill the user and record how it went.
 * It reads and writes the same skills.json as the web app; an open tab picks up changes within a few seconds.
 *
 * Run: npm run mcp   (stdio)
 */
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AREAS, askQuestion, endSession, recordAttempt, statusOf } from "../src/lib/skills";
import { loadTree, updateTree } from "../src/lib/store";
import { MAX_MASTERY, type Skill, type Tree } from "../src/lib/types";

// Claude Code may start us from any directory; without DOJO_DATA_DIR, use this project's data folder.
process.env.DOJO_DATA_DIR ??= path.join(path.dirname(path.resolve(process.argv[1])), "..", "data");

class UserError extends Error {}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

async function run(fn: () => Promise<string>) {
  try {
    return text(await fn());
  } catch (err) {
    if (err instanceof UserError) return { ...text(err.message), isError: true };
    throw err;
  }
}

function findSkill(tree: Tree, ref: string): Skill {
  const r = ref.trim().toLowerCase();
  const skill =
    tree.skills.find((s) => s.id === r) ??
    tree.skills.find((s) => s.title.toLowerCase() === r) ??
    (() => {
      const partial = tree.skills.filter((s) => s.title.toLowerCase().includes(r) || s.id.includes(r));
      return partial.length === 1 ? partial[0] : undefined;
    })();
  if (!skill) throw new UserError(`No skill matches "${ref}". Use list_skills to see ids.`);
  return skill;
}

function formatSkill(skill: Skill, tree: Tree): string {
  const status = statusOf(skill, tree.skills);
  const req = skill.requires.length ? ` · builds on ${skill.requires.join(", ")}` : "";
  return `[${skill.id}] ${skill.title} — ${status}, ${skill.mastery}/${MAX_MASTERY}${req}`;
}

/* ───────────── Server ───────────── */

const server = new McpServer(
  { name: "dojo", version: "1.0.0" },
  {
    instructions:
      "The user's dojo: a skill tree of software-engineering concepts they are learning (they are a junior engineer). " +
      "When they say 'grill me on <skill>', call get_skill first so you can see past answers and aim at earlier gaps. " +
      "Then ask ONE question at a time, calling ask_question with it each time so the dojo shows it live, and wait for their answer — never answer it for them. Prefer 'explain why' and " +
      "'what would happen if' questions tied to their real work (the skill's seenIn) over definitions. After each answer, " +
      "call record_attempt with a verdict: solid (correct and they could defend it in code review), partial (right idea, " +
      "missing a key piece) or gap (wrong or can't explain). Then tell them in one or two lines what was right, what was " +
      "missing, and the next question. Stop after 3–5 questions or when they ask. Use add_skill when a new concept comes " +
      "up in their work that deserves its own node. Call end_grilling when you stop.",
  },
);

const skillRef = z.string().describe("Skill id (e.g. git-branching) or title");

server.registerTool(
  "list_skills",
  {
    description: "Every skill in the tree with its status (locked/open/learning/mastered) and mastery out of 3.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  () =>
    run(async () => {
      const tree = await loadTree();
      const areas = [...new Set([...AREAS, ...tree.skills.map((s) => s.area)])];
      return areas
        .map((area) => {
          const inArea = tree.skills.filter((s) => s.area === area);
          return inArea.length ? `${area}:\n` + inArea.map((s) => `  ${formatSkill(s, tree)}`).join("\n") : "";
        })
        .filter(Boolean)
        .join("\n\n");
    }),
);

server.registerTool(
  "get_skill",
  {
    description: "One skill in full: summary, where the user met it, prerequisites and every graded answer so far.",
    inputSchema: { skill: skillRef },
    annotations: { readOnlyHint: true },
  },
  ({ skill: ref }) =>
    run(async () => {
      const tree = await loadTree();
      const s = findSkill(tree, ref);
      const lines = [formatSkill(s, tree), `Area: ${s.area}`, `Summary: ${s.summary}`];
      if (s.seenIn) lines.push(`Seen in: ${s.seenIn}`);
      lines.push(
        s.history.length
          ? "History:\n" + s.history.map((a) => `  ${a.at.slice(0, 10)} ${a.verdict.toUpperCase()}: ${a.question}\n    ${a.feedback}`).join("\n")
          : "History: none yet",
      );
      return lines.join("\n");
    }),
);

server.registerTool(
  "record_attempt",
  {
    description:
      "Grades one answer. solid raises mastery by 1, gap lowers it by 1, partial keeps it. 3 out of 3 masters the skill.",
    inputSchema: {
      skill: skillRef,
      question: z.string().describe("The question you asked, in one line"),
      verdict: z.enum(["gap", "partial", "solid"]),
      feedback: z.string().describe("One or two lines: what was right and what was missing"),
    },
  },
  ({ skill: ref, question, verdict, feedback }) =>
    run(async () => {
      let result = "";
      await updateTree((tree) => {
        const s = findSkill(tree, ref);
        const next = recordAttempt(tree, s.id, { at: new Date().toISOString(), question, verdict, feedback });
        const after = next.skills.find((x) => x.id === s.id)!;
        result = `Recorded ${verdict}. ${formatSkill(after, next)}`;
        if (after.mastery >= MAX_MASTERY && s.mastery < MAX_MASTERY) {
          const unlocked = next.skills.filter(
            (x) => x.requires.includes(s.id) && statusOf(x, tree.skills) === "locked" && statusOf(x, next.skills) !== "locked",
          );
          result += `\nMastered!${unlocked.length ? ` Unlocked: ${unlocked.map((x) => x.title).join(", ")}` : ""}`;
        }
        return next;
      });
      return result;
    }),
);

server.registerTool(
  "ask_question",
  {
    description: "Shows the question you're about to ask in the dojo, live, so the user can follow the grilling there.",
    inputSchema: { skill: skillRef, question: z.string().describe("The question, as you'll ask it") },
  },
  ({ skill: ref, question }) =>
    run(async () => {
      let result = "";
      await updateTree((tree) => {
        const s = findSkill(tree, ref);
        const next = askQuestion(tree, s.id, question);
        result = `Showing question ${next.session!.asked} on ${s.title}.`;
        return next;
      });
      return result;
    }),
);

server.registerTool(
  "end_grilling",
  {
    description: "Clears the live grilling from the dojo once you've finished.",
    inputSchema: {},
  },
  () =>
    run(async () => {
      await updateTree(endSession);
      return "Grilling ended.";
    }),
);

server.registerTool(
  "add_skill",
  {
    description: "Adds a new concept to the tree, e.g. one that just came up in the user's work.",
    inputSchema: {
      id: z.string().regex(/^[a-z0-9-]+$/).describe("Short kebab-case slug"),
      title: z.string(),
      area: z.string().describe(`Usually one of ${AREAS.join(", ")}; a new area gets its own lane`),
      summary: z.string().describe("One plain-English line: what it is"),
      requires: z.array(z.string()).optional().describe("Ids of skills to master first"),
      seenIn: z.string().optional().describe("Where it came up in their real work"),
    },
  },
  ({ id, title, area, summary, requires = [], seenIn }) =>
    run(async () => {
      let result = "";
      await updateTree((tree) => {
        if (tree.skills.some((s) => s.id === id)) throw new UserError(`A skill called "${id}" already exists.`);
        const missing = requires.filter((r) => !tree.skills.some((s) => s.id === r));
        if (missing.length) throw new UserError(`Unknown prerequisites: ${missing.join(", ")}`);
        const skill: Skill = { id, title, area, summary, requires, seenIn, mastery: 0, history: [] };
        const next = { ...tree, skills: [...tree.skills, skill] };
        result = `Added ${formatSkill(skill, next)}`;
        return next;
      });
      return result;
    }),
);

server.registerTool(
  "update_skill",
  {
    description: "Edits a skill's title, area, summary, prerequisites or seenIn. Mastery only changes through record_attempt.",
    inputSchema: {
      skill: skillRef,
      title: z.string().optional(),
      area: z.string().optional(),
      summary: z.string().optional(),
      requires: z.array(z.string()).optional(),
      seenIn: z.string().optional(),
    },
  },
  ({ skill: ref, ...changes }) =>
    run(async () => {
      let result = "";
      await updateTree((tree) => {
        const s = findSkill(tree, ref);
        if (changes.requires?.some((r) => r === s.id || !tree.skills.some((x) => x.id === r))) {
          throw new UserError("Prerequisites must be other existing skill ids.");
        }
        const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
        const next = { ...tree, skills: tree.skills.map((x) => (x.id === s.id ? { ...x, ...defined } : x)) };
        result = `Updated ${formatSkill(next.skills.find((x) => x.id === s.id)!, next)}`;
        return next;
      });
      return result;
    }),
);

void server.connect(new StdioServerTransport());

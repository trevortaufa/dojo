/**
 * The same live-grilling updates as the MCP server, from a terminal, for chats that don't have it connected.
 *
 *   npm run dojo -- ask <skill> "<question>"
 *   npm run dojo -- grade <skill> <gap|partial|solid> "<feedback>"
 *   npm run dojo -- end
 */
import { askQuestion, endSession, recordAttempt } from "../src/lib/skills";
import { updateTree } from "../src/lib/store";
import type { Verdict } from "../src/lib/types";

const [cmd, skill, a, b] = process.argv.slice(2);
const VERDICTS: Verdict[] = ["gap", "partial", "solid"];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

void updateTree((tree) => {
  const known = (id: string | undefined) => tree.skills.find((s) => s.id === id) ?? fail(`Unknown skill "${id}".`);
  switch (cmd) {
    case "ask":
      known(skill);
      if (!a) fail("Missing the question.");
      return askQuestion(tree, skill, a);
    case "grade": {
      known(skill);
      if (!VERDICTS.includes(a as Verdict)) fail(`Verdict must be one of ${VERDICTS.join(", ")}.`);
      if (!b) fail("Missing the feedback.");
      const question = tree.session?.skill === skill ? tree.session.question : "(not recorded)";
      return recordAttempt(tree, skill, { at: new Date().toISOString(), question, verdict: a as Verdict, feedback: b });
    }
    case "end":
      return endSession(tree);
    default:
      return fail("Usage: dojo ask|grade|end ...");
  }
}).then((tree) => {
  const s = tree.skills.find((x) => x.id === skill);
  console.log(s ? `${s.title}: ${s.mastery}/3` : "Grilling ended.");
});

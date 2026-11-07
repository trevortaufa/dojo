import { z } from "zod";
import { AnswerError, answerExercise, publicTree } from "@/lib/exercises";
import { updateTree } from "@/lib/store";

const Body = z.object({
  exercise: z.string().min(1),
  choice: z.number().int().nonnegative().optional(),
  text: z.string().max(5000).optional(),
});

/** Saves an answer to one exercise. Quizzes come back graded; written answers wait for Claude. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { exercise, choice } or { exercise, text }." }, { status: 400 });
  const { exercise, ...answer } = parsed.data;
  try {
    return Response.json(publicTree(await updateTree((tree) => answerExercise(tree, exercise, answer))));
  } catch (err) {
    if (err instanceof AnswerError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

import { connection } from "next/server";
import { publicTree } from "@/lib/exercises";
import { loadTree } from "@/lib/store";

// Unanswered quizzes are sent without their answers, so the right option can't be read in devtools.
export async function GET() {
  await connection();
  return Response.json(publicTree(await loadTree()));
}

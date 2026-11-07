import { connection } from "next/server";
import { withLiveSession } from "@/lib/skills";
import { loadTree } from "@/lib/store";

// Read-only for now: grades are recorded by Claude through the MCP server.
export async function GET() {
  await connection();
  return Response.json(withLiveSession(await loadTree()));
}

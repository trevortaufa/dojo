import { connection } from "next/server";
import { loadTree } from "@/lib/store";

// Read-only for now: grades are recorded by Claude through the MCP server.
export async function GET() {
  await connection();
  return Response.json(await loadTree());
}

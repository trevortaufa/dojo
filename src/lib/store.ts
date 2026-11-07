import { promises as fs } from "node:fs";
import path from "node:path";
import { withSeedExercises } from "./exercises";
import { seedTree } from "./skills";
import type { Tree } from "./types";

// The tree lives in one JSON file shared by the web app and the MCP server.
// DOJO_DATA_DIR points it at a synced folder (Work OneDrive) so every PC sees the same progress.
export function dataDir() {
  return process.env.DOJO_DATA_DIR ?? path.join(process.cwd(), "data");
}
const treeFile = () => path.join(dataDir(), "skills.json");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, "utf8");
  try {
    await fs.rename(tmp, file);
  } catch {
    // Windows can refuse the rename while another process has the file open.
    await fs.writeFile(file, text, "utf8");
    await fs.rm(tmp, { force: true });
  }
}

/** On Windows (and in OneDrive folders especially) a lock that's mid-delete fails with these instead of EEXIST. */
const BUSY = new Set(["EEXIST", "EPERM", "EACCES", "EBUSY"]);
const RM_LOCK = { recursive: true, force: true, maxRetries: 10, retryDelay: 25 } as const;

/** Cross-process lock (the web app and MCP server are separate processes). */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(dataDir(), { recursive: true });
  const lock = path.join(dataDir(), "skills.lock");
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.mkdir(lock);
      break;
    } catch (err) {
      if (!BUSY.has((err as NodeJS.ErrnoException).code ?? "")) throw err;
      // Break locks left behind by a crashed process.
      const stat = await fs.stat(lock).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 5000) await fs.rm(lock, RM_LOCK).catch(() => {});
      else if (attempt > 200) throw new Error("Timed out waiting for the skills lock");
      else await new Promise((r) => setTimeout(r, 25));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lock, RM_LOCK).catch(() => {});
  }
}

/** Reads the tree (seeding it on first run), applies `change` and saves if anything changed. */
export function updateTree(change: (tree: Tree) => Tree = (t) => t): Promise<Tree> {
  return withLock(async () => {
    const stored = await readJson<Tree>(treeFile());
    // Trees saved before exercises existed get the starter set; that counts as a change, so it's saved.
    const current = withSeedExercises(stored ?? seedTree());
    const next = change(current);
    if (stored && next === stored) return stored;
    const saved = { ...next, rev: current.rev + 1 };
    await writeJson(treeFile(), saved);
    return saved;
  });
}

export const loadTree = () => updateTree();

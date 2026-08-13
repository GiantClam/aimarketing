import { mkdir, open, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { DesktopPaths } from "./paths";

export async function acquireInstanceLock(paths: DesktopPaths): Promise<() => Promise<void>> {
  await mkdir(paths.root, { recursive: true });
  let handle: FileHandle;
  try { handle = await open(paths.lockFile, "wx"); await handle.writeFile(`${process.pid}\n`, "utf8"); }
  catch (error) { throw new Error(`desktop_instance_already_running: ${paths.root}`, { cause: error }); }
  return async () => { await handle.close(); try { await unlink(paths.lockFile); } catch { /* already removed */ } };
}

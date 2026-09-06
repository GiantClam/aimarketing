import { access, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type DesktopStorageMode = "normal" | "portable";

export interface DesktopPaths {
  readonly mode: DesktopStorageMode;
  readonly root: string;
  readonly data: string;
  readonly projects: string;
  readonly artifacts: string;
  readonly logs: string;
  readonly runtime: string;
  readonly configFile: string;
  readonly databaseFile: string;
  readonly lockFile: string;
}

export function detectDesktopPaths(options: { readonly executableDir?: string; readonly localAppData?: string } = {}): DesktopPaths {
  const executableDir = resolve(options.executableDir ?? process.cwd());
  const portable = join(executableDir, "portable.flag");
  const isPortable = existsSync(portable);
  const root = isPortable
    ? join(executableDir, "data")
    : join(options.localAppData ?? process.env.LOCALAPPDATA ?? join(process.env.TEMP ?? ".", "LocalAppData"), "CoworkAny");
  return createPaths(root, isPortable ? "portable" : "normal");
}

export function createPaths(root: string, mode: DesktopStorageMode): DesktopPaths {
  const resolved = resolve(root);
  return {
    mode,
    root: resolved,
    data: resolved,
    projects: join(resolved, "projects"),
    artifacts: join(resolved, "artifacts"),
    logs: join(resolved, "logs"),
    runtime: join(resolved, "runtime"),
    configFile: join(resolved, "config.json"),
    databaseFile: join(resolved, "app.db"),
    lockFile: join(resolved, "instance.lock"),
  };
}

export async function ensureDesktopPaths(paths: DesktopPaths) {
  await Promise.all([paths.root, paths.projects, paths.artifacts, paths.logs, paths.runtime].map((path) => mkdir(path, { recursive: true })));
  await access(dirname(paths.configFile));
}

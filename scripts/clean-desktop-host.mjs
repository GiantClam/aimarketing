import { readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "desktop", "dist-runtime");
for (const name of await readdir(directory).catch(() => [])) {
  if (name.endsWith(".node")) await unlink(join(directory, name)).catch(() => undefined);
}

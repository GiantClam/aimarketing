import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const requiredFonts = [
    "Noto Sans CJK SC",
    "Noto Serif CJK SC",
    "Liberation Sans",
    "Liberation Serif",
    "Liberation Mono",
];
export async function checkFonts() {
    const missing = [];
    for (const font of requiredFonts) {
        try {
            const { stdout } = await execFileAsync("fc-match", [font, "--format=%{family}\n"]);
            const normalized = stdout.toLowerCase();
            const hint = font.toLowerCase().split(" ")[0] || font.toLowerCase();
            if (!normalized.includes(hint)) {
                missing.push(font);
            }
        }
        catch {
            missing.push(font);
        }
    }
    return {
        requiredFonts,
        missing,
    };
}

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";


const desktopRoot = process.cwd();

function pngDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function icoSizes(path: string): number[] {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const width = bytes[6 + index * 16];
    return width === 0 ? 256 : width;
  }).sort((left, right) => left - right);
}

test("desktop brand assets are wired into the window, bundle, and responsive sidebar", () => {
  const app = readFileSync(resolve(desktopRoot, "src/App.tsx"), "utf8");
  const index = readFileSync(resolve(desktopRoot, "index.html"), "utf8");
  const styles = readFileSync(resolve(desktopRoot, "src/styles.css"), "utf8");
  const tauriConfig = JSON.parse(readFileSync(resolve(desktopRoot, "src-tauri/tauri.conf.json"), "utf8")) as {
    bundle: { icon: string[] };
  };

  assert.ok(existsSync(resolve(desktopRoot, "public/brand/ai-marketing-icon-64.png")));
  assert.ok(existsSync(resolve(desktopRoot, "public/brand/ai-marketing-logo.svg")));
  assert.ok(existsSync(resolve(desktopRoot, "src-tauri/icons/ai-marketing-icon.ico")));
  assert.deepEqual(pngDimensions(resolve(desktopRoot, "public/brand/ai-marketing-icon-64.png")), { width: 64, height: 64 });
  assert.deepEqual(icoSizes(resolve(desktopRoot, "src-tauri/icons/ai-marketing-icon.ico")), [16, 24, 32, 48, 64, 128, 256]);
  for (const svg of ["ai-marketing-logo.svg", "ai-marketing-logo-dark.svg"]) {
    const source = readFileSync(resolve(desktopRoot, "public/brand", svg), "utf8");
    assert.match(source, /^<svg[\s\S]*<title[^>]*>AI Marketing<\/title>[\s\S]*<\/svg>\s*$/u);
    assert.doesNotMatch(source, /<script\b/iu);
  }
  assert.match(index, /href="\/brand\/ai-marketing-icon-64\.png"/u);
  assert.deepEqual(tauriConfig.bundle.icon, ["icons/ai-marketing-icon.ico"]);
  const csp = (tauriConfig as unknown as { app: { security: { csp: string } } }).app.security.csp;
  assert.match(csp, /connect-src[^;]*ipc:\s*http:\/\/ipc\.localhost/u);
  const capability = JSON.parse(readFileSync(resolve(desktopRoot, "src-tauri/capabilities/default.json"), "utf8")) as { permissions: string[] };
  assert.ok(capability.permissions.includes("core:event:default"));
  assert.match(styles, /\.wb-brand-mark[^}]+background:\s*var\(--wb-sidebar-highlight/u);
  assert.match(styles, /\.wb-brand-title[^}]+ai-marketing-logo\.svg/u);
  assert.match(styles, /\.wb-brand-title[^}]+display:\s*none/u);
  assert.doesNotMatch(styles, /\.wb-shell:not\(\.wb-shell-collapsed\)[^}]+\.wb-brand-mark[^}]+display:\s*none/u);
  assert.match(styles, /\.bootstrap-mark[^}]+ai-marketing-icon-64\.png/u);
  assert.match(app, /"--primary":\s*WORKBENCH_THEME\.light\.primary/u);
  assert.match(app, /"--sidebar-primary":\s*WORKBENCH_THEME\.light\.sidebarPrimary/u);
  assert.match(app, /"--wb-sidebar-highlight":\s*WORKBENCH_THEME\.light\.sidebarPrimary/u);
  assert.match(app, /className="bootstrap-screen" style=\{(?:style|workbenchThemeStyle)\}/u);
  assert.match(app, /className="wb-runtime-status"[\s\S]*name="runtime"/u);
  assert.match(styles, /\.wb-runtime-status-icon\s*\{/u);
  assert.doesNotMatch(styles, /#f5f84a/u);
});

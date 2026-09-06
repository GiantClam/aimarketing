import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPresentationArtifacts } from "../runtime/presentation-artifacts";

test("presentation artifact detector returns local relative paths and hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "coworkany-ppt-artifacts-"));
  try {
    await writeFile(join(root, "deck.pptx"), new Uint8Array([1, 2, 3]));
    await writeFile(join(root, "preview.svg"), "<svg></svg>", "utf8");
    await writeFile(join(root, "preview.html"), "<!doctype html><title>Deck</title>", "utf8");
    const artifacts = await detectPresentationArtifacts(root, Date.now() - 1000);
    assert.deepEqual(artifacts.map((item) => item.relativePath), ["deck.pptx", "preview.html", "preview.svg"]);
    assert.equal(artifacts[0].kind, "pptx");
    assert.equal(artifacts[1].kind, "preview");
    assert.equal(artifacts[0].sha256.length, 64);
  } finally { await rm(root, { recursive: true, force: true }); }
});

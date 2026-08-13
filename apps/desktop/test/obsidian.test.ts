import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { activateIndexGeneration, createIndexGenerationPath, indexObsidianVault, ObsidianVaultWatcher, reconcileObsidianVault, resolveActiveIndexPath, searchVault, writeObsidianNote } from "../runtime/obsidian";

test("indexes Obsidian markdown with Chinese and spaces, then searches locally", async () => {
  const root = await mkdtemp(join(tmpdir(), "AI Marketing Vault "));
  const vault = join(root, "我的 Vault"); const index = join(root, "indexes", "vault-a");
  try {
    await mkdir(join(vault, "项目"), { recursive: true });
    await writeFile(join(vault, "项目", "活动.md"), "---\ntags: [营销, 品牌]\n---\n# 春季活动\n#营销 本地营销工作台内容 [[策略笔记]] [官网](https://example.com) ![[素材/主图.png]] [素材说明](附件/brief.pdf)", "utf8");
    const manifest = await indexObsidianVault(vault, index);
    assert.equal(manifest.generation, 1); assert.equal(manifest.chunks.length, 1);
    assert.equal(searchVault(manifest, "营销")[0]?.chunk.documentPath, "项目/活动.md");
    assert.deepEqual(manifest.chunks[0].tags, ["#营销", "#品牌"]);
    assert.deepEqual(manifest.chunks[0].links, ["策略笔记", "https://example.com", "素材/主图.png", "附件/brief.pdf"]);
    assert.deepEqual([manifest.chunks[0].lineStart, manifest.chunks[0].lineEnd], [4, 5]);
    assert.equal(JSON.parse(await readFile(join(index, "manifest.json"), "utf8")).vaultPath, vault);
    assert.equal(JSON.parse(await readFile(join(index, "index-state.json"), "utf8")).status, "lexical_ready");
    await writeFile(join(vault, "项目", "活动.md"), "# 春季活动\n更新后的本地营销内容", "utf8");
    const next = await indexObsidianVault(vault, index);
    assert.equal(next.generation, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("honors Vault ignore rules and nested hidden paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-vault-ignore-"));
  const index = join(root, "index");
  try {
    await mkdir(join(root, "visible"), { recursive: true });
    await mkdir(join(root, "ignored", "nested"), { recursive: true });
    await mkdir(join(root, ".hidden"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "ignored/\n*.secret.md\n", "utf8");
    await writeFile(join(root, ".aimarketingignore"), "private/\n", "utf8");
    await writeFile(join(root, "visible", "ok.md"), "# 可检索\n公开内容", "utf8");
    await writeFile(join(root, "ignored", "nested", "skip.md"), "# 不应出现\nignored", "utf8");
    await writeFile(join(root, ".hidden", "hidden.md"), "# 不应出现\nhidden", "utf8");
    await writeFile(join(root, "private.secret.md"), "# 不应出现\nsecret", "utf8");
    await mkdir(join(root, "private"), { recursive: true });
    await writeFile(join(root, "private", "personal.md"), "# 不应出现\nprivate", "utf8");
    const manifest = await indexObsidianVault(root, index);
    assert.deepEqual(manifest.documents.map((item) => item.documentPath), ["visible/ok.md"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Obsidian writes are scoped and protected by a base hash", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-vault-write-"));
  try {
    const first = await writeObsidianNote({ vaultPath: root, content: "# 新笔记\n内容" });
    assert.equal(first.path, "AI Marketing/generated-note.md");
    await assert.rejects(() => writeObsidianNote({ vaultPath: root, targetPath: first.path, content: "stale", baseHash: "wrong" }), /obsidian_write_conflict/);
    await assert.rejects(() => writeObsidianNote({ vaultPath: root, targetPath: "../outside.md", content: "escape" }), /obsidian_path_escape/);
    const manifest = await indexObsidianVault(root, join(root, ".index"));
    const reconciliation = await reconcileObsidianVault(manifest);
    assert.deepEqual(reconciliation.changed, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Obsidian watcher can start and stop without requiring Obsidian", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-vault-watch-"));
  try {
    const watcher = new ObsidianVaultWatcher(root, () => undefined).start();
    watcher.stop();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Obsidian index generations activate atomically after a complete manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-vault-generation-"));
  const vault = join(root, "Vault"); const index = join(root, "indexes", "vault");
  try {
    await mkdir(vault, { recursive: true });
    await writeFile(join(vault, "note.md"), "# First\nlocal content", "utf8");
    const generationPath = createIndexGenerationPath(index);
    const manifest = await indexObsidianVault(vault, index, 0, generationPath);
    assert.equal(resolveActiveIndexPath(index), index);
    await activateIndexGeneration(index, generationPath, manifest.generation);
    assert.equal(resolveActiveIndexPath(index), generationPath);
    assert.equal(JSON.parse(await readFile(join(index, "current-generation.json"), "utf8")).generation, 1);
    assert.equal(JSON.parse(await readFile(join(resolveActiveIndexPath(index), "manifest.json"), "utf8")).documents.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

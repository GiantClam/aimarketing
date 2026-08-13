## 1. Shared Writer and Skill foundation

- [x] 1.2a 抽取 `writer-core` revision guard、title-only body preservation 和 optimistic message reconciliation 首个共享切片。
- [x] 1.4a 将 `content/skills/` catalog/digest 生成器接入共享 Skill 包并验证 37 个 canonical skills。

- [x] 1.1 为 Writer config、types、result、revision guard、session runtime、assets 和 message reconciliation 补共享契约测试
  - [x] 2026-08-13 `packages/writer-core/test/revision.test.ts` covers title-only preservation, incomplete results, invariants, bounded session context and optimistic reconciliation.
- [x] 1.2 将纯 Writer 逻辑抽入 `packages/writer-core`，原 `lib/writer` 路径保留兼容 re-export
  - [x] 2026-08-13 pure guards/session/reconciliation live in `packages/writer-core`; SaaS `lib/writer` modules retain compatibility wrappers.
- [x] 1.3 将 DB、R2、企业知识和云 runtime 留在 SaaS adapter
  - [x] 2026-08-13 writer-core architecture scan rejects Next, DB/auth/billing/R2/Railway/Cloudflare/fetch/process-env dependencies.
- [x] 1.4 将 `content/skills/` 固定为 Web/Desktop Skill 单一源并生成 catalog/digest
  - [x] 2026-08-13 shared catalog generation and desktop bundling consume `content/skills/`; catalog validation covers the canonical skill set.
- [x] 1.5 桌面端只发布确认保留的内容写作 Skills
  - [x] 2026-08-13 desktop runtime contains the generated canonical catalog plus the pinned `ppt-master` manifest; no SaaS Skill registry is consulted at runtime.

**Quality Gate:**
- [x] `writer-core` 无 Next、DB、R2、企业或 Railway/Cloudflare 导入
  - [x] 2026-08-13 architecture test passes.
- [x] 现有 Writer 纯逻辑回归通过
  - [x] 2026-08-13 writer-core test suite passes 6/6.
- [x] Desktop 写作 contract 证明所有 turn 经过 OpenCode
  - [x] 2026-08-13 desktop route regression requires writer/PPT routes to use the OpenCode session path.

## 2. Local ppt-master runtime

- [x] 2.1 将实际 `ppt-master` Skill、references 和脚本纳入 desktop runtime manifest
  - [x] 2026-08-13 bundler pins upstream commit `4e6ecbcb0dc079efebd3c79b775c0f02581509fe`, copies the complete Skill tree and writes `ppt-master.manifest.json` with digest.
- [x] 2.2 为 Python、必要 imports、字体目录和 `ppt-master` 输出建立 capability probe（运行时现在会校验依赖导入、字体门禁，并生成带中英文字段的 16:9 可编辑 PPTX 后再选择 Python 路径）
  - [x] 2026-08-14 real OpenCode run `20260813235355-bf0ebb03` used the configured `pptoken/gpt-5.4` OpenAI-compatible provider and pinned Skill commit `4e6ecbcb0dc079efebd3c79b775c0f02581509fe`; six SVGs and one PPTX were produced without Railway.
- [x] 2.3 实现本地 PPT service，仅通过 OpenCode session 调用 Skill
  - [x] 2026-08-13 desktop PPT route uses the same `session.create`/`session.prompt` OpenCode path as ordinary chat; no second text runtime is registered.
- [x] 2.4 发现并登记项目目录中的 PPTX、SVG、preview 和诊断产物
  - [x] 2026-08-13 `detectPresentationArtifacts` returns constrained relative paths, kind and SHA-256 for PPTX/SVG/preview outputs; regression covers local discovery.
- [x] 2.5 删除 desktop composition 对 `infra/railway/ppt-master-worker` 的任何依赖
  - [x] 2026-08-13 desktop architecture scan and runtime source contain no Railway worker import or network route.

**Quality Gate:**
- [x] 中文、图片、16:9、可编辑文本 PPT smoke 通过
  - [x] 2026-08-14 Skill checker/export passed; independent `pptx-structure.json` passed with 3 slides, 56 editable text shapes, 435 editable CJK characters, one grouped picture, embedded media and Microsoft YaHei; PowerPoint 16.0 opened the deck and rendered 3 previews.
- [ ] 连续两轮修改保持同一项目/session 上下文
- [ ] Python 或字体损坏时启动门禁可自动修复

## 3. Vault direct access

- [x] 3.3a 直接读取 UTF-8 Markdown、去除 frontmatter、按 heading 分块并保留 Vault 相对路径。
- [x] 3.4a 生成每 Vault 独立 manifest/generation/hash，并用原子 rename 写入索引清单。
- [x] 3.4 启动/恢复 reconciliation 比较每个 Markdown 的内容 hash，并报告 changed/removed 文档。
- [x] 3.5 Windows watcher 提供增量变更提示，并由 manifest reconciliation 负责最终一致性。

- [x] 3.1 设置页支持用户显式选择、重新定位及解除当前 Vault 绑定；解除仅清除待保存的本地配置与索引路径，不删除用户 Vault 或索引文件。 ✓ 2026-08-13
- [x] 3.2 实现 `.obsidian`、trash、隐藏路径、用户 ignore 和 symlink loop 规则。✓ 2026-08-13 — 扫描和 watcher 统一排除 `.obsidian`、`.trash`、隐藏路径、symbolic link，以及 Vault `.gitignore` / `.aimarketingignore` 规则；回归测试覆盖两类用户 ignore。
- [x] 3.3 解析 Markdown、frontmatter、wikilink、标准链接、标签和附件。✓ 2026-08-13 — UTF-8 Markdown 按 heading 分块，保留相对路径、行范围、frontmatter/inline tags、Wiki/Markdown links 及本地附件引用；中英文与附件 fixture 覆盖解析结果。
- [x] 3.4 建立每 Vault manifest/hash 清单和启动/唤醒 reconciliation
  - [x] 2026-08-13 per-Vault manifest/generation/hash and startup reconciliation are implemented and covered by Obsidian tests.
- [x] 3.5 实现 watcher 增量事件与 rename/delete 恢复
  - [x] 2026-08-13 Windows watcher emits incremental hints while reconciliation handles changed/removed/renamed files; regression covers ignore rules and reconciliation.

**Quality Gate:**
- [x] Obsidian 未启动时全部功能可用 — 2026-08-14 desktop tests index/search/write a Vault directly and start/stop the watcher without an Obsidian process; all paths are filesystem/runtime owned.
- [x] 中文、空格、长路径、OneDrive 和 10k+ Markdown fixture 通过
  - [x] 2026-08-13 `apps/desktop/test/obsidian.test.ts` indexes 10,000 UTF-8 Markdown files under a OneDrive-shaped Chinese path, including a deep long-path note, then verifies all documents/chunks are retained.
- [x] watcher 漏事件后 reconciliation 可恢复一致性
  - [x] 2026-08-13 the same regression keeps `ObsidianVaultWatcher` active while mutating/removing files, waits for the debounced watcher window, and verifies manifest hash reconciliation reports changed/removed paths.

## 4. Local RAG and citations

- [x] 4.1a 在语义索引未就绪时提供基于标题/关键词的本地检索。
- [x] 4.1b 提供 host-neutral hybrid lexical/vector retriever 与 Vault citation DTO；LanceDB embedding adapter 仍待接入。
- [x] 4.3a 每 Vault 生成独立 `index-state.json`，语义索引未配置时明确标记 `lexical_ready`。
- [x] 4.5a Desktop knowledge page now uses host-mediated `knowledge.search`, renders path/heading/line citations, and opens notes through a Vault-root constrained Tauri command.
- [x] 3.4b Indexing recovers the previous manifest generation when the caller omits it, so restart/rebuild generations remain monotonic.

- [x] 4.1 在语义索引未就绪时提供标题/tag/link/关键词扫描检索。✓ 2026-08-13 — shared lexical retriever 统一检索路径、heading、tags、links 与正文，仍返回原始笔记 excerpt；Desktop fallback 回归覆盖元数据命中且不依赖 SQLite/远程调用。
- [x] 4.2 实现本地 embedding 默认路径和每 Vault LanceDB 目录。✓ 2026-08-13 — 默认 loopback local embedding（不可用时 deterministic local hash fallback）写入每 Vault 独立 `indexPath/lancedb`；双 Vault 中文路径回归证明状态与检索结果不会交叉污染。
- [x] 4.3 写入 `index-state.json` 并在不兼容时建立新 generation 后原子切换。✓ 2026-08-13 — manifest 与 embedding state 先写入私有 generation，`current-generation.json` 仅在 LanceDB 建成后原子指向新 generation；模型/维度变化回归证明旧向量保留但不会与新 generation 混用。
- [x] 4.4 实现 lexical + vector hybrid retrieval 和 top-k 限制。✓ 2026-08-13 — `index-state.json` 仅标记 `semantic_ready` 后才查询 LanceDB，随后按 40% lexical / 60% vector 合并并限制为 1–20 条；状态转换回归覆盖 semantic hybrid 与 lexical-only fallback。
- [x] 4.5 返回 Vault 相对路径、标题、段落、行范围和可点击引用
  - [x] 2026-08-13 knowledge search DTOs retain relative path, heading and line range; desktop knowledge UI renders clickable Vault-root-constrained citations.
- [x] 4.6 实现可选远程 embedding，并在 UI 明示远程发送范围。✓ 2026-08-13 — 默认 local-only embedding；用户在设置中显式切换 Remote 后才通过 HTTPS OpenAI-compatible `/embeddings` 发送待索引片段，独立 API key 仅透传给 Host，不写入 SQLite/日志/诊断包；回归覆盖远程 opt-in、鉴权与模型记录。

**Quality Gate:**
- [x] `app.db` 不含 chunk、vector 或 Vault 原文 — 2026-08-14 storage schema and RAG/LanceDB tests keep manifests, chunks, and vectors in the Vault index boundary rather than SQLite.
  - [x] 2026-08-13 SQLite schema and storage tests keep Vault chunks/vectors outside `app.db`; the storage credential-boundary regression also verifies structured run/workflow metadata is redacted before persistence.
- [x] 选定本地 embedding 能在中文/空格路径的每 Vault LanceDB 写入、关闭、重开并返回稳定排序结果 — `LanceDB semantic index persists, reopens and isolates a Vault` passes in the Desktop suite.
- [x] 两个 Vault 的索引相互隔离，watcher 漏事件后可由 manifest reconciliation 修复 — the same LanceDB isolation test and the 10k-document watcher/reconciliation regression pass.
- [x] 索引删除/损坏/模型变化均可重建 — `embedding contract changes activate a complete new generation without mixing vectors` verifies generation rollover and atomic activation.
- [x] 未显式启用知识库时不向远程文本模型发送 Vault 内容 — `remote embedding is opt-in, HTTPS-only, and records its configured model` and desktop RAG boundary tests keep remote embedding disabled by default.

## 5. Governed Vault writes and UI

- [x] 5.1-5.3 Host 内置 Obsidian 写入端口默认写入 `AI Marketing/`，支持 target/baseHash 并在冲突时拒绝覆盖；UI/E2E 展示仍待完成。
- [x] 5.4 UI 明示 Full Access 文件工具可绕过内置写入端口
  - [x] 2026-08-13 desktop route regression asserts the bilingual Full Access warning, plaintext API-key boundary, and no permission-mode selector.
- [x] 5.5 添加写作、PPT、索引状态、引用和冲突 E2E
  - [x] 2026-08-14 `apps/desktop/test/writing-ppt-obsidian-e2e.test.ts` runs one local fake-OpenCode flow that streams a writer/PPT artifact event, writes and indexes a Chinese Vault note, verifies lexical index state and citation metadata, discovers PPTX/SVG artifacts with hashes, and proves one optimistic-write conflict.

**Quality Gate:**
- [x] 内置写入端口的并发冲突测试通过 — 2026-08-14 `apps/desktop/test/obsidian.test.ts` races two writes against the same base hash; the target-scoped write lock allows one commit and returns `obsidian_write_conflict` for the stale writer.
- [x] Full Access 风险文案与实时工具事件均可见
  - [x] 2026-08-13 route regression covers the warning copy; existing host-session fixtures cover streamed tool events and emergency stop evidence.
- [x] 全部新增测试、SaaS build 和 desktop build 通过 — 2026-08-14 Desktop 97/97, desktop typecheck/build, root lint, root typecheck, and Next production build all passed.

## Completion Checklist

- [ ] 所有阶段与质量门禁通过
- [ ] `desktop-local-writing`、`desktop-ppt-master`、`desktop-obsidian-rag` specs 全部满足
- [ ] 文档、运行时清单和诊断说明同步
- [ ] Ready for `openspec-archive add-writing-ppt-and-obsidian-rag`

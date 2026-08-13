## 1. Shared Writer and Skill foundation

- [x] 1.2a 抽取 `writer-core` revision guard、title-only body preservation 和 optimistic message reconciliation 首个共享切片。
- [x] 1.4a 将 `content/skills/` catalog/digest 生成器接入共享 Skill 包并验证 37 个 canonical skills。

- [ ] 1.1 为 Writer config、types、result、revision guard、session runtime、assets 和 message reconciliation 补共享契约测试
- [ ] 1.2 将纯 Writer 逻辑抽入 `packages/writer-core`，原 `lib/writer` 路径保留兼容 re-export
- [ ] 1.3 将 DB、R2、企业知识和云 runtime 留在 SaaS adapter
- [ ] 1.4 将 `content/skills/` 固定为 Web/Desktop Skill 单一源并生成 catalog/digest
- [ ] 1.5 桌面端只发布确认保留的内容写作 Skills

**Quality Gate:**
- [ ] `writer-core` 无 Next、DB、R2、企业或 Railway/Cloudflare 导入
- [ ] 现有 Writer 纯逻辑回归通过
- [ ] Desktop 写作 contract 证明所有 turn 经过 OpenCode

## 2. Local ppt-master runtime

- [ ] 2.1 将实际 `ppt-master` Skill、references 和脚本纳入 desktop runtime manifest
- [ ] 2.2 为 Python、必要 imports、字体目录和 `ppt-master` 输出建立 capability probe
- [ ] 2.3 实现本地 PPT service，仅通过 OpenCode session 调用 Skill
- [ ] 2.4 发现并登记项目目录中的 PPTX、SVG、preview 和诊断产物
- [ ] 2.5 删除 desktop composition 对 `infra/railway/ppt-master-worker` 的任何依赖

**Quality Gate:**
- [ ] 中文、图片、16:9、可编辑文本 PPT smoke 通过
- [ ] 连续两轮修改保持同一项目/session 上下文
- [ ] Python 或字体损坏时启动门禁可自动修复

## 3. Vault direct access

- [x] 3.3a 直接读取 UTF-8 Markdown、去除 frontmatter、按 heading 分块并保留 Vault 相对路径。
- [x] 3.4a 生成每 Vault 独立 manifest/generation/hash，并用原子 rename 写入索引清单。
- [x] 3.4 启动/恢复 reconciliation 比较每个 Markdown 的内容 hash，并报告 changed/removed 文档。
- [x] 3.5 Windows watcher 提供增量变更提示，并由 manifest reconciliation 负责最终一致性。

- [ ] 3.1 实现用户显式选择、移除和重新定位 Vault
- [ ] 3.2 实现 `.obsidian`、trash、隐藏路径、用户 ignore 和 symlink loop 规则
- [ ] 3.3 解析 Markdown、frontmatter、wikilink、标准链接、标签和附件
- [ ] 3.4 建立每 Vault manifest/hash 清单和启动/唤醒 reconciliation
- [ ] 3.5 实现 watcher 增量事件与 rename/delete 恢复

**Quality Gate:**
- [ ] Obsidian 未启动时全部功能可用
- [ ] 中文、空格、长路径、OneDrive 和 10k+ Markdown fixture 通过
- [ ] watcher 漏事件后 reconciliation 可恢复一致性

## 4. Local RAG and citations

- [x] 4.1a 在语义索引未就绪时提供基于标题/关键词的本地检索。
- [x] 4.1b 提供 host-neutral hybrid lexical/vector retriever 与 Vault citation DTO；LanceDB embedding adapter 仍待接入。
- [x] 4.3a 每 Vault 生成独立 `index-state.json`，语义索引未配置时明确标记 `lexical_ready`。
- [x] 4.5a Desktop knowledge page now uses host-mediated `knowledge.search`, renders path/heading/line citations, and opens notes through a Vault-root constrained Tauri command.
- [x] 3.4b Indexing recovers the previous manifest generation when the caller omits it, so restart/rebuild generations remain monotonic.

- [ ] 4.1 在语义索引未就绪时提供标题/tag/link/关键词扫描检索
- [ ] 4.2 实现本地 embedding 默认路径和每 Vault LanceDB 目录
- [ ] 4.3 写入 `index-state.json` 并在不兼容时建立新 generation 后原子切换
- [ ] 4.4 实现 lexical + vector hybrid retrieval 和 top-k 限制
- [ ] 4.5 返回 Vault 相对路径、标题、段落、行范围和可点击引用
- [ ] 4.6 实现可选远程 embedding，并在 UI 明示远程发送范围

**Quality Gate:**
- [ ] `app.db` 不含 chunk、vector 或 Vault 原文
- [ ] 选定本地 embedding 能在中文/空格路径的每 Vault LanceDB 写入、关闭、重开并返回稳定排序结果
- [ ] 两个 Vault 的索引相互隔离，watcher 漏事件后可由 manifest reconciliation 修复
- [ ] 索引删除/损坏/模型变化均可重建
- [ ] 未显式启用知识库时不向远程文本模型发送 Vault 内容

## 5. Governed Vault writes and UI

- [x] 5.1-5.3 Host 内置 Obsidian 写入端口默认写入 `AI Marketing/`，支持 target/baseHash 并在冲突时拒绝覆盖；UI/E2E 展示仍待完成。
- [ ] 5.4 UI 明示 Full Access 文件工具可绕过内置写入端口
- [ ] 5.5 添加写作、PPT、索引状态、引用和冲突 E2E

**Quality Gate:**
- [ ] 内置写入端口的并发冲突测试通过
- [ ] Full Access 风险文案与实时工具事件均可见
- [ ] 全部新增测试、SaaS build 和 desktop build 通过

## Completion Checklist

- [ ] 所有阶段与质量门禁通过
- [ ] `desktop-local-writing`、`desktop-ppt-master`、`desktop-obsidian-rag` specs 全部满足
- [ ] 文档、运行时清单和诊断说明同步
- [ ] Ready for `openspec-archive add-writing-ppt-and-obsidian-rag`

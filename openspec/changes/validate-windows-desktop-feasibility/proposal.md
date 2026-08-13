## Why

Windows Desktop v1 的产品范围、进程拓扑和存储边界已经由产品负责人确认。此前将 WebView2 首装修复、OpenCode session、`ppt-master` 和 LanceDB 四项诊断同时设为 foundation 的强制前置条件，会把实现验收和发布验收错误地前移到共享核心抽取之前，造成不必要的串行阻塞。

本 change 将已有 spike 证据保留为工程诊断，并明确每项风险的下游责任。它不再要求诊断全部通过才开始共享核心抽取，而是记录已经批准的架构决定、不可逾越的边界，以及后续 change 必须完成的生产级验收。

## Current Verdict

**Foundation decision：`approved`（2026-08-11）。** `extract-shared-application-core` 可以开始；完成共享边界与 SaaS parity gate 后，`establish-desktop-foundation` 可以实施。

**Release readiness：`pending`。** WebView2 真实缺失环境、干净 Windows 10/11、最终包体积、签名与完整恢复矩阵仍由 `harden-windows-desktop-release` 验收，不代表当前产品已可发布。

当前 spike 的 `pass` 或 `changes-required` 仅描述诊断覆盖范围，不改变上述 foundation 决定。OpenCode + `ppt-master` 的单机可运行性已由产品负责人接受；实际产品集成仍必须在其所属 change 中通过回归测试。

## What Changes

- 记录 Tauri + React、Rust 主进程、私有 workflow-host、OpenCode、本地 SQLite、per-Vault LanceDB 的架构方向已批准。
- 明确 WebView2 是 Tauri 在 Windows 上承载 React UI 的渲染运行时；启动修复在 foundation 实现，真实缺失与干净 VM 验收在 release hardening 完成。
- 保留 OpenCode session spike 作为协议实现参考；生产集成、普通对话、工具事件和取消由 `add-local-opencode-workbench` 验收。
- 接受 OpenCode + `ppt-master` 的单机技术路径；真实中文 PPTX、字体、预览和产物回归由 `add-writing-ppt-and-obsidian-rag` 验收。
- 保留 LanceDB spike 作为 embedded store 参考；本地 embedding、Vault 增量索引和检索正确性由 `add-writing-ppt-and-obsidian-rag` 验收。
- 将干净 Windows 矩阵、运行时下载安装、签名、体积和恢复转交 `harden-windows-desktop-release`。
- 更新结果文档，使 foundation 决定、诊断状态和 release readiness 彼此独立。

## Capabilities

### New Capabilities

- `windows-desktop-foundation-decision`: 已批准的桌面架构方向、实施解锁条件和风险转交规则。
- `desktop-runtime-spikes`: 非阻断诊断证据及其下游验收归属。

### Modified Capabilities

无。该 change 不修改生产行为。

## Scope

### In Scope

- 架构决定、诊断证据分类和下游验收责任。
- `scripts/desktop-spikes/` 现有结果的事实性保留。
- foundation、能力实现和 release hardening 之间的明确依赖关系。

### Out of Scope

- 正式 Tauri 应用、SQLite schema、workflow-host 或共享 package 抽取。
- 在本 change 中补做生产级 OpenCode、PPT、RAG 或 WebView2 功能。
- 宣称 Windows v1 已满足发布条件。

## Dependency Ordering

1. 本 change 以 `approved` 的 foundation decision 完成架构交接。
2. `extract-shared-application-core` 随后实施，并以 host-neutral boundary 与 SaaS parity 为自己的质量门禁。
3. `establish-desktop-foundation` 在共享抽取完成后实施 WebView 前置启动、存储和进程基础。
4. OpenCode、PPT/RAG 与媒体分别在所属 capability change 中完成真实集成验收。
5. 干净 Win10/Win11、缺失运行时、签名、包体积和发布恢复只在 `harden-windows-desktop-release` 形成发布门禁。

## Impact

- 不删除或伪造现有 spike 证据，只调整其决策含义。
- 解锁共享 TypeScript 核心抽取，避免因发布矩阵未完成而阻塞 host-neutral 工作。
- 后续 change 不能引用本 change 规避自身的生产集成或发布验收。

## Success Criteria

- [x] Foundation decision 明确为 `approved`。
- [x] Release readiness 明确保持 `pending`。
- [x] 四类诊断的下游责任均有唯一归属。
- [x] 共享核心抽取不再依赖四项 spike 全部通过。
- [x] 现有证据保留脱敏、可审计且不被描述成生产验收。

## Risks

- 把 foundation approval 误读为 release approval：结果文档和 downstream specs 必须分开记录两种状态。
- 下游以“可行性已确认”为由跳过真实测试：每个 capability change 仍保留自己的集成质量门禁。
- 实现中发现进程或存储边界失效：暂停受影响 change 并修订其 spec，不回退为泛化的四项前置门禁。

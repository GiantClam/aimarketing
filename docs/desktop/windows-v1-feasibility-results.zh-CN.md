# Windows 桌面版 v1 架构决定与诊断结果

日期：2026-08-11  
OpenSpec change：`validate-windows-desktop-feasibility`

## 决定

| 状态 | 结论 |
| --- | --- |
| Foundation decision | **`approved`**：可以开始 `extract-shared-application-core`；共享抽取完成后可以实施 `establish-desktop-foundation`。 |
| Release readiness | **`pending`**：当前版本尚未通过干净 Win10/Win11、缺失运行时、签名、体积和恢复验收，不能发布。 |
| Runtime spike status | **mixed / non-blocking**：现有证据作为实现参考，不再作为共享抽取的统一前置门禁。 |

产品负责人已确认单机 OpenCode + `ppt-master` Skill 的技术路径可用，不需要再次论证其可行性。正式产品仍须在对应 capability change 中完成集成与回归；这与“是否允许开始 foundation”是两件事。

## 为什么需要 WebView2

WebView2 只因为桌面壳采用 Tauri + React：Tauri 在 Windows 上通过 WebView2 渲染 React 工作台。它不是 OpenCode、`ppt-master`、SQLite 或 LanceDB 的依赖。

因此责任拆分为：

- `establish-desktop-foundation`：实现创建主 WebView 之前的原生探测/修复状态机和安装 seam。
- `harden-windows-desktop-release`：在真实缺失环境和干净 Win10/Win11 VM 验证自动安装、失败阻塞、修复后创建 WebView、签名与恢复。
- `extract-shared-application-core`：不创建 WebView，不等待上述发布级证据。

## 验证环境

现有诊断证据来自当前开发机，不是干净 VM：

| 项目 | 值 |
| --- | --- |
| 系统 | Windows 11 家庭版中文版，10.0.26200，build 26200，x64 |
| PowerShell | 7.6.4 |
| Rust | rustc/cargo 1.93.0，MSVC x64 |
| Node / pnpm | Node 24.15.0 / pnpm 9.15.4 |
| Python | 3.13.12 |
| OpenCode | system 1.17.15；private 1.18.14 |
| WebView2 | 开发机已安装 148.0.3967.54 |
| PowerPoint | 16.0 |

统一基线证据：`scripts/desktop-spikes/common/evidence/baseline.local.json`。

## 诊断结果与下游归属

### 1. WebView2 bootstrap

当前观察：

- 最小 Rust bootstrap 可独立编译和测试，不依赖 React/WebView 显示修复状态。
- 已安装 runtime 探测、模拟缺失后修复、失败阻塞路径通过。
- 未在真实缺失 WebView2 的干净 VM 执行官方安装器和实际 Tauri WebView 创建。

结论：**非阻断诊断**。Foundation 实现 pre-window seam；真实缺失与 clean-VM 验收归 `harden-windows-desktop-release`。

证据：`scripts/desktop-spikes/webview-bootstrap/evidence/webview-bootstrap.local.json`。

### 2. OpenCode 常驻会话

系统版 1.17.15 与私有版 1.18.14 在当前开发机均完成 17 项断言：随机 loopback/Basic Auth、401、health、session create、同 session 多轮、SSE text、tool started/completed、usage、未知事件、abort、受控退出与随机端口重启。

结论：**协议参考已具备**。正式 desktop composition、普通对话全部经过 OpenCode、崩溃恢复和用户体验验收归 `add-local-opencode-workbench`。

证据：

- `scripts/desktop-spikes/opencode-session/evidence/system.json`
- `scripts/desktop-spikes/opencode-session/evidence/private.json`
- `scripts/desktop-spikes/opencode-session/evidence/summary.json`

### 3. OpenCode + ppt-master

产品决定：采用 OpenCode session + `ppt-master` Skill + 本地 Python，直接在项目目录产生 PPTX；不引入 Railway `ppt-master worker`。

当前诊断曾确认 OpenCode 可读取 upstream `ppt-master` 4.5.0、routing/Quick 配置并初始化项目，但该次运行未形成可审计的 Skill 产物。辅助 deck 只验证私有 Python、中文字体、OOXML、PowerPoint 打开和预览链路，不代表正式集成验收。

结论：**单机可行性已由产品负责人接受，不再是 foundation 前置条件**。真实中文、图片、16:9、可编辑 PPTX、连续修改、字体和预览回归归 `add-writing-ppt-and-obsidian-rag`。

证据：

- `scripts/desktop-spikes/ppt-master/evidence/ppt-master.local.json`
- `scripts/desktop-spikes/ppt-master/evidence/VERDICT.md`
- `scripts/desktop-spikes/ppt-master/evidence/auxiliary-pptx-structure.json`
- `scripts/desktop-spikes/ppt-master/evidence/auxiliary-powerpoint-open-render.json`

### 4. Embedded LanceDB

当前 Windows 11 x64 开发机已观察到：

- LanceDB 0.37.1 embedded、`default-features = false` 可编译运行，无需独立数据库服务。
- 中文/空格路径的两个 per-Vault 目录可写入、关闭、重开、查询并保持隔离。
- 文件锁和非法路径有明确诊断；integration tests 4/4、Clippy、debug build 和 probe 通过。
- 构建需要可复现 `protoc`；当前约 230 MB 是 debug executable，不是发布体积。
- 该 probe 使用确定性向量，尚未串接首版本地 embedding。

结论：**embedded store 诊断可供实现参考**。真实 local embedding、增量索引、检索排序和重建归 `add-writing-ppt-and-obsidian-rag`；release build、最终体积和 Win10/Win11 矩阵归 `harden-windows-desktop-release`。

证据：`scripts/desktop-spikes/lancedb/evidence/windows-current.json`。

## 不变的工程约束

1. WebView2 修复必须发生在创建主 WebView 之前，不依赖 React 安装页。
2. OpenCode 不能只检查版本；需要 capability probe，并在选定后固定 absolute executable path。
3. 普通对话、Writer、PPT 和通用 Agent 的文本回合全部经过 OpenCode。
4. `ppt-master` 直接作为 Skill 运行，不创建独立 worker。
5. SQLite 不存 Vault 原文、chunk、vector、媒体二进制或完整事件流；每 Vault LanceDB 可删除重建。
6. Foundation approval 不等于 release approval；干净 VM、签名、体积和恢复只由 release change 放行。

## 风险转交清单

| 待验证项 | Owner change | 阻塞对象 |
| --- | --- | --- |
| 正式 OpenCode session/普通对话/tool/abort/recovery | `add-local-opencode-workbench` | 本地工作台 capability |
| 真实 `ppt-master` 中文 PPTX 与连续修改 | `add-writing-ppt-and-obsidian-rag` | PPT capability |
| 本地 embedding + LanceDB 端到端检索与重建 | `add-writing-ppt-and-obsidian-rag` | Obsidian RAG capability |
| WebView2 真实缺失自动安装与修复后创建 UI | `harden-windows-desktop-release` | Windows release |
| 干净 Win10/Win11、签名、镜像回退、最终体积与恢复 | `harden-windows-desktop-release` | Windows release |

## 最终门禁决定

- **Foundation：`approved`。** 下一项工作是 apply `extract-shared-application-core`。
- **Release：`pending`。** 在 `harden-windows-desktop-release` 全部 quality gates 通过前不得发布。
- 本 change 未修改 `app/`、`components/`、`lib/` 或任何生产路径。

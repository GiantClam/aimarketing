## Purpose

定义 Windows runtime spikes 的非阻断诊断作用，以及每条技术路径必须由哪个下游 change 完成生产或发布验收。

## ADDED Requirements

### Requirement: Runtime spikes are diagnostic inputs

Runtime spike SHALL 记录当前环境中观察到的协议、依赖、构建和产物行为。Spike 的 `pass` 或 `changes-required` 只描述诊断覆盖范围，MUST NOT 代替下游 change 的 production acceptance，也 MUST NOT 单独阻塞 host-neutral 共享核心抽取。

#### Scenario: A spike passes on the current development machine

- **GIVEN** 某技术路径在当前 Windows 开发机通过
- **WHEN** 下游 change 开始生产集成
- **THEN** 它可以复用诊断结论，但仍执行自己的 integration tests

#### Scenario: A clean-VM run is missing

- **GIVEN** spike 尚未覆盖干净 Windows 10/11 VM
- **WHEN** foundation decision 已批准且宿主边界未被否定
- **THEN** 缺口转入 release verification，不阻塞共享抽取

### Requirement: WebView2 acceptance has implementation and release owners

WebView2 SHALL 仅被视为 Tauri 在 Windows 上承载 React UI 的渲染运行时。`establish-desktop-foundation` SHALL 实现 pre-window probe/repair seam；`harden-windows-desktop-release` SHALL 验证真实缺失环境、自动安装、失败阻塞和修复后 WebView 创建。

#### Scenario: Shared extraction starts before a missing-runtime VM exists

- **GIVEN** WebView2 缺失路径只有诊断或模拟证据
- **WHEN** `extract-shared-application-core` 开始
- **THEN** 抽取继续，因为它不创建 WebView 或负责 Windows 安装

### Requirement: OpenCode production behavior belongs to the local workbench

现有 OpenCode session spike SHALL 作为随机 loopback 端口、Basic Auth、session、事件、工具和 abort 的协议参考。`add-local-opencode-workbench` MUST 用正式 desktop composition 验证这些行为以及普通对话全部经过 OpenCode。

#### Scenario: The product workbench integrates OpenCode

- **GIVEN** 当前主机 spike 已观察到所需协议
- **WHEN** desktop workbench 实现普通对话和 Agent run
- **THEN** 该 change 运行自己的端到端集成并记录失败恢复

### Requirement: ppt-master viability is accepted and integration remains tested

产品 SHALL 采用 OpenCode + `ppt-master` Skill + 本地 Python 的单机路径，并 SHALL NOT 引入 `ppt-master worker`。其可行性不再作为 foundation 前置；`add-writing-ppt-and-obsidian-rag` MUST 验证真实中文、图片、16:9、可编辑 PPTX、字体和预览产物。

#### Scenario: Foundation begins without an audit-grade spike deck

- **GIVEN** 产品负责人已接受本地 OpenCode + Skill 路径
- **WHEN** shared extraction 或 foundation 开始
- **THEN** 工作继续，PPTX 真实回归保留在 writing/PPT change

### Requirement: LanceDB and local embedding are capability acceptance

LanceDB SHALL 作为每 Vault 独立的嵌入式向量存储候选，不要求独立数据库服务。`add-writing-ppt-and-obsidian-rag` MUST 验证选定本地 embedding、写入、关闭重开、查询、Vault 隔离和增量重建；最终 release build、体积和支持系统矩阵 SHALL 由 hardening 验收。

#### Scenario: Embedded storage spike uses deterministic vectors

- **GIVEN** spike 已证明当前主机可持久化和重开查询，但尚未串接首版本地 embedding
- **WHEN** RAG capability 开始实现
- **THEN** 它在自己的 quality gate 中完成 embedding 端到端测试，不阻塞此前的共享抽取

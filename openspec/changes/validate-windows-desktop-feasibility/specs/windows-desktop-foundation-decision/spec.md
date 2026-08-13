## Purpose

定义 Windows Desktop v1 已批准的基础架构决定、实施解锁条件，以及实现验收与发布验收的责任边界。

## ADDED Requirements

### Requirement: Accepted architecture unlocks shared extraction

系统 SHALL 在产品负责人接受 Tauri/React、Rust host、私有 workflow-host、OpenCode、本地 SQLite 和 per-Vault LanceDB 的架构方向后，允许开始 host-neutral 共享核心抽取。共享抽取 MUST NOT 以 WebView2 缺失安装、PPT 生成、local embedding 或干净 Windows VM 的发布级证据作为前置条件。

#### Scenario: Architecture direction is accepted

- **GIVEN** foundation decision 为 `approved`
- **WHEN** `extract-shared-application-core` 开始实施
- **THEN** 它以共享边界和 SaaS parity 为质量门禁，不等待四项 runtime spike 全部通过

#### Scenario: Release evidence is incomplete

- **GIVEN** clean-VM、WebView2 真实缺失、签名或最终体积证据仍不完整
- **WHEN** 团队开始共享核心抽取或 foundation 开发
- **THEN** 开发可以继续，但 `harden-windows-desktop-release` 仍保持未通过

### Requirement: Foundation approval is not release approval

系统 SHALL 独立记录 foundation decision 与 release readiness。Foundation decision 的 `approved` 只允许实施后续 changes，MUST NOT 被解释为 Windows v1 已可分发。

#### Scenario: Status is reported to a reviewer

- **GIVEN** foundation decision 为 `approved` 且 release readiness 为 `pending`
- **WHEN** 评审者查看结果文档
- **THEN** 文档明确说明可以开始实现，但不能发布

### Requirement: Boundary-invalidating discoveries revise affected specs

如果实现证据证明已批准的进程拓扑、宿主所有权或存储边界不可成立，受影响 change SHALL 暂停并修订其 proposal/spec；未受影响的共享抽取和能力工作 MUST NOT 被泛化的四项门禁自动阻塞。

#### Scenario: A storage boundary becomes invalid

- **GIVEN** 实现发现 Rust 独占本地存储的边界不可满足
- **WHEN** 该发现影响 foundation 或 RAG 架构
- **THEN** 团队修订受影响 spec 和 adapter 边界后再继续相关工作

#### Scenario: A diagnostic lacks release coverage

- **GIVEN** 某 spike 只在当前开发机运行而未覆盖干净 VM
- **WHEN** 其技术路径未否定已批准的宿主边界
- **THEN** 缺口转入 capability 或 release acceptance，不回退 foundation decision

### Requirement: Decision evidence remains auditable

现有 diagnostic evidence SHALL 保留环境、版本、命令、退出状态、耗时、关键日志、产物哈希和限制，并 SHALL 对凭据与用户敏感路径脱敏。

#### Scenario: Reviewer audits a diagnostic result

- **GIVEN** 某项 spike 被引用为实现参考
- **WHEN** 评审者检查对应 evidence
- **THEN** 可以区分真实观察、未覆盖范围和下游待验收项

## Purpose

定义桌面端媒体 Provider 的配置、异步任务、恢复、本地产物和用量行为。

## ADDED Requirements

### Requirement: Media providers are called directly from the local runtime

桌面端 SHALL 使用用户配置的 Provider API 直接执行媒体请求，允许 reference upload、异步 submit、poll 和临时 URL；请求不得经过 AIMarketing 业务后端、Railway、R2 或云任务服务。

#### Scenario: Generate an image
- **GIVEN** 用户配置了可用的 OpenAI-compatible 或 Bailian 图片 Provider
- **WHEN** 用户或工作流提交图片生成
- **THEN** 本地 runtime 直接调用该 Provider，并把结果下载到项目目录

#### Scenario: Generate video, avatar, music or audio
- **GIVEN** 对应 MiniMax、Bailian 或 RunningHub 配置通过 probe
- **WHEN** 用户提交受支持媒体能力
- **THEN** 本地 runtime 使用对应 provider client 执行并跟踪任务

### Requirement: Unconfigured capabilities remain discoverable

未配置 Provider 的媒体能力 SHALL 继续出现在工作台和工作流节点目录中，并返回结构化 `provider_configuration_required`，不得静默隐藏或回退到 AIMarketing 云端。

#### Scenario: Digital human provider is missing
- **GIVEN** RunningHub 未配置
- **WHEN** 用户选择数字人节点
- **THEN** UI 显示“需要配置”及设置入口，run 不发出网络请求

### Requirement: Async submissions are recoverable and idempotent

异步媒体 attempt SHALL 在 submit 前持久化 idempotency key，并在获得 provider task ID 后立即持久化。恢复时 MUST 继续 poll/download，而不是自动重复 submit。

#### Scenario: App exits after submit
- **GIVEN** provider task ID 已保存但结果尚未完成
- **WHEN** 应用重启并恢复 run
- **THEN** runtime 使用已有 task ID 继续查询，不创建第二个任务

#### Scenario: Exit occurs before task ID is known
- **GIVEN** attempt 已有 idempotency key 但 submit 结果未知
- **WHEN** 用户恢复或重试
- **THEN** adapter 按 Provider 能力安全查询/重放，若无法证明安全则标记需人工重试

### Requirement: Successful media is downloaded before completion

Provider 成功状态只有在结果已流式下载到 canonical 临时路径、验证并原子移动到项目目录后，才能标记为本地 run 成功；系统 SHALL 在本地文件持久化前保持 attempt 为未完成状态。

#### Scenario: Temporary URL is available
- **GIVEN** Provider 返回短期有效下载 URL
- **WHEN** poll 首次观察到成功
- **THEN** runtime 立即下载并验证文件，再完成 attempt

#### Scenario: Download fails
- **GIVEN** Provider 任务成功但文件下载或验证失败
- **WHEN** attempt 结算
- **THEN** attempt 保留 provider task ID 并进入可恢复状态，不登记损坏 artifact

### Requirement: Media data does not transit IPC as base64

大媒体 SHALL 通过本地临时文件流转；UI/RPC 仅传相对路径、状态和元数据。

#### Scenario: Large video completes
- **GIVEN** Provider 输出大视频
- **WHEN** workflow-host 保存结果
- **THEN** 文件直接写入 Rust 分配的安全路径，IPC 不承载完整字节

### Requirement: Usage is statistical, not billing

系统 SHALL 记录 Provider、模型、请求量、可得 token/时长和预估成本，但不得扣费、限制余额或代表用户支付 Provider 费用。

#### Scenario: Provider reports usage
- **GIVEN** 响应包含 usage 字段
- **WHEN** attempt 完成
- **THEN** 系统创建 usage record 并在统计页显示

#### Scenario: Price is unknown
- **GIVEN** 当前模型没有本地价格配置
- **WHEN** 记录 usage
- **THEN** 显示请求量且成本为未知，不伪造估价

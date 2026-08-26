## Purpose

定义线上 SSE 与桌面 OpenCode/Tauri 共同使用的版本化结构化消息 part 协议，确保过程消息、附件、产物和恢复行为一致。

## ADDED Requirements

### Requirement: Messages SHALL expose versioned structured parts

`WorkbenchMessage` SHALL 支持版本化的 `parts`，至少包括 text、reasoning、plan、task、tool-call、source、attachment、artifact、usage、warning/status。每个 part SHALL 具有稳定 id；运行相关 part SHALL 保留 sequence、createdAt 和状态。

#### Scenario: Render a complete assistant turn

- **GIVEN** 一次 assistant turn 包含 reasoning、plan、tool-call、text 和 artifact
- **WHEN** adapter 完成事件转换
- **THEN** shared timeline SHALL 按 sequence 渲染所有 part
- **AND** 正文、执行过程和产物 SHALL 保持可区分的 UI 区域

### Requirement: Adapters SHALL preserve ordering and be idempotent

线上和桌面 adapter SHALL 保留事件 sequence/createdAt，并对同一 run、message、part、toolCallId 的重复增量进行幂等合并；adapter MUST NOT 在流式完成时重写原始 message creation time。

#### Scenario: A terminal event is delivered twice

- **GIVEN** runtime 重复发送同一个 tool result 或 done event
- **WHEN** adapter 合并事件
- **THEN** message SHALL 只包含一个对应 part
- **AND** part status/output SHALL 保持最终一致

### Requirement: Old flat messages SHALL remain readable

没有 parts 的旧消息 SHALL 在读取时转换为等价 text part；未知 part type SHALL 保留可诊断信息或安全降级，不得阻断整个会话恢复。

#### Scenario: Restore an old persisted message

- **GIVEN** 数据库只保存 `content` 而没有结构化 parts
- **WHEN** 用户重新打开会话
- **THEN** adapter SHALL 生成一个 text part
- **AND** 消息正文、时间和会话列表标题 SHALL 保持不变

### Requirement: Runtime adapters SHALL expose complete process evidence

OpenCode/Tauri 和线上 SSE adapter SHALL 转换 reasoning、plan、task、tool input/output/error、usage、status、attachment 和 artifact 事件；UI 不得通过拼接字符串替代结构化 part。

#### Scenario: A local OpenCode run fails in a tool

- **GIVEN** OpenCode 发送 tool input 后返回错误
- **WHEN** Desktop adapter 写入消息和运行记录
- **THEN** shared Tool SHALL 显示工具、输入、错误和 failed 状态
- **AND** 用户 SHALL 能够重试或查看诊断，而不会看到重复的纯文本工具尾巴

### Requirement: Parts SHALL survive refresh and recovery

消息和运行存储 SHALL 保留 parts 的 id、sequence、createdAt、status 以及必要的 input/output refs；刷新、重新进入或应用重启后 SHALL 能恢复已完成和进行中的过程状态。

#### Scenario: The app restarts during a running task

- **GIVEN** task/plan/tool part 已持久化且 run 尚未完成
- **WHEN** Desktop 重启并恢复会话
- **THEN** UI SHALL 显示最后已知状态
- **AND** runtime SHALL 继续 poll/监听或显示 bounded recoverable failure，不得静默丢失过程消息

## MODIFIED

### Requirement: Shared workbench message parity

现有 `shared-workbench-ui-parity` 的 structured timeline 要求扩展为 V2 parts；目标入口必须渲染 AI Elements 过程组件，而不仅是基础的平铺事件行。

#### Scenario: A P0 route displays a process message

- **GIVEN** P0 入口收到 reasoning、plan、task 或 tool-call part
- **WHEN** Web 或 Desktop 渲染消息
- **THEN** 两端 SHALL 使用同一 V2 renderer 和对应 AI Elements primitive
- **AND** host-specific adapter 只负责数据和动作

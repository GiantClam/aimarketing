## Purpose

定义桌面端使用共享工作流核心执行完整 v1 节点集合、持久化运行和恢复的行为。

## ADDED Requirements

### Requirement: Desktop and SaaS share workflow semantics

工作流 schema、migrations、graph validation、parallel levels、foreach、collect、cancel 和 resume compatibility SHALL 来自共享 `workflow-core`，Web/Desktop adapters MUST 运行同一组核心 contract tests。

#### Scenario: Core workflow behavior changes
- **GIVEN** workflow-core 的迁移或执行算法被修改
- **WHEN** CI 运行 Web/Desktop contract suites
- **THEN** 两端必须同时通过，且 desktop 不维护复制实现

### Requirement: The v1 node registry matches the approved scope

桌面注册表 SHALL 包含 upload、text input、file create、writer、LLM、agent、image、video、digital human、music、voice synthesis/clone、generic audio、PPT、knowledge retrieve/write、local product store、foreach、collect 和 output。它 MUST NOT 注册 Lead Hunter、publish-as-agent、workflow marketplace 或 enterprise preset。

#### Scenario: Open the node palette
- **GIVEN** 用户进入桌面工作流编辑器
- **WHEN** 节点目录加载
- **THEN** 显示所有已批准 v1 节点且不显示排除节点

### Requirement: Text workflow capabilities use OpenCode

LLM、writer、agent 和 PPT 等文本/Skill 节点 SHALL 通过本地 OpenCode runtime 执行；desktop workflow MUST NOT 直接调用文本模型 SDK 或 Next API route。

#### Scenario: Run an LLM node
- **GIVEN** 工作流包含 LLM 节点
- **WHEN** 节点开始执行
- **THEN** run events 包含对应 OpenCode session/turn 证据

### Requirement: Runs support cancellation, retry and recovery

系统 SHALL 持久化 run、node、attempt、关键事件和 checkpoint，并支持取消、节点/分支重试以及基于 capability 类型的恢复。

#### Scenario: Cancel a running workflow
- **GIVEN** 某些节点正在执行
- **WHEN** 用户点击取消或紧急停止
- **THEN** 系统传播 AbortSignal、停止本地子进程/可取消 Provider，并把未完成节点标记为 cancelled/interrupted

#### Scenario: Resume an async media node
- **GIVEN** 节点已有 provider task ID
- **WHEN** 应用重启并恢复 workflow
- **THEN** 节点继续 poll/download，不重复 submit

#### Scenario: Recover an interrupted OpenCode tool run
- **GIVEN** OpenCode 在工具执行中崩溃
- **WHEN** workflow 恢复
- **THEN** 节点标记 interrupted，并由用户明确重试而不自动重复副作用

### Requirement: Workflow artifacts and outputs are local

节点结果 SHALL 以结构化 output bundle 和本地 artifact refs 传递；媒体与文件保存在项目目录，SQLite 只保存路径和元数据。

#### Scenario: Pass image output to video input
- **GIVEN** 图片节点已生成本地 artifact
- **WHEN** 下游视频节点读取 image port
- **THEN** workflow 传递验证后的本地引用，不创建云存储副本

### Requirement: Workflow UI exposes execution evidence

运行界面 SHALL 展示节点状态、文本/工具事件、Provider 轮询、产物、错误、重试入口和用量。

#### Scenario: A node fails
- **GIVEN** Provider 返回结构化错误
- **WHEN** run 页面显示节点
- **THEN** 用户看到可理解错误、保留的诊断摘要和合法重试方式


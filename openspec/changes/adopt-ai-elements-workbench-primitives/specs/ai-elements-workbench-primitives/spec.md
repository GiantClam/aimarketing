## Purpose

定义 Web 与 Tauri Desktop 共同使用的 AI Elements 风格对话组件，以及组件的 host-neutral 组合和可访问性要求。

## ADDED Requirements

### Requirement: Target conversation surfaces SHALL use shared AI Elements primitives

首页、AI 对话、专家 Agent、写作助手和创作工作台 SHALL 使用 `@coworkany/workbench-ui` 导出的 Message、Prompt Input、Attachments、Reasoning、Plan、Task、Tool 和 Model Selector；host code MAY 提供 adapter props，但 MUST NOT 复制这些组件的页面级实现。

#### Scenario: Web and Desktop render the same conversation surface

- **GIVEN** Web 和 Desktop 打开同一个 P0 conversation route
- **WHEN** 用户查看消息、输入框或过程状态
- **THEN** 两端 SHALL 使用同一公共组件和 CSS export
- **AND** 只有数据、导航、文件和执行动作由 host adapter 提供

### Requirement: Prompt Input SHALL compose text, attachments, model selection and actions

共享 Prompt Input SHALL 支持文本输入、Enter 发送、Shift+Enter 换行、附件预览/删除、模型选择、停止和禁用状态，并为所有动作提供可访问名称。

#### Scenario: Submit a message with an attachment

- **GIVEN** 用户在任一 P0 入口输入文本并添加本地文件
- **WHEN** 用户点击发送或按 Enter
- **THEN** Prompt Input SHALL 提交结构化文本和 attachment refs
- **AND** UI SHALL 清空或保留输入状态取决于 host 返回的提交结果

### Requirement: Process components SHALL support streaming and terminal states

Reasoning、Plan、Task 和 Tool SHALL 支持 running、completed/succeeded、failed、cancelled 和 blocked/waiting 状态；Plan/过程内容 SHALL 可折叠，流式期间 SHALL 提供明确的 loading 状态。

#### Scenario: A tool call streams input and output

- **GIVEN** runtime 先发送 tool input，再发送 output 或 error
- **WHEN** 共享 Tool 组件接收增量 part
- **THEN** 组件 SHALL 展示工具名、输入、当前状态和最终输出/错误
- **AND** 重复事件不得创建重复的工具卡片

### Requirement: Model Selector SHALL be searchable and keyboard accessible

Model Selector SHALL 支持按 Provider 分组、模糊搜索、空状态、键盘导航和选择回调；选择结果 SHALL 由 host adapter 持久化到当前入口/能力 scope。

#### Scenario: Select a configured model

- **GIVEN** 当前能力有多个 Provider 和模型
- **WHEN** 用户搜索并选择一个模型
- **THEN** Selector SHALL 返回稳定的 provider/model identity
- **AND** 不得把另一个能力的模型目录混入当前选择器

### Requirement: Shared primitives SHALL remain host-neutral

组件 SHALL NOT 直接导入 Next navigation、Tauri invoke、SQLite、Provider SDK 或网络客户端；所有外部动作 SHALL 通过 typed props、callbacks 或 adapter interfaces 注入。

#### Scenario: Desktop opens a local artifact

- **GIVEN** Message 中存在本地 artifact part
- **WHEN** 用户激活打开/显示操作
- **THEN** 共享组件 SHALL 调用 artifact callback
- **AND** Desktop adapter SHALL 决定使用 open 或 reveal，而组件不读取本地文件系统

### Requirement: Shared primitives SHALL provide accessible interactions

按钮、输入框、弹层、折叠项和模型选择器 SHALL 提供 ARIA label、键盘操作、焦点可见性和窄屏布局；组件不得仅依赖颜色表达状态。

#### Scenario: Navigate the composer without a mouse

- **GIVEN** 用户仅使用键盘
- **WHEN** 用户从文本输入移动到附件、模型选择、停止和发送控件
- **THEN** 每个控件 SHALL 可聚焦、可操作并拥有可理解的 accessible name

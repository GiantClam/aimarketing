## Purpose

定义桌面端内容写作的共享核心和 OpenCode 执行行为，避免迁移云端基础设施或形成独立 Writer 分叉。

## ADDED Requirements

### Requirement: Every desktop writing turn uses OpenCode

桌面端 SHALL 通过本地 OpenCode session 执行每一个内容写作文本 turn，不得存在直接调用文本模型 SDK、SaaS Writer API 或备用生成路径。

#### Scenario: Create new content
- **GIVEN** 用户已配置可用文本 Provider
- **WHEN** 用户从桌面写作入口提交新内容请求
- **THEN** 应用创建或续接 OpenCode session，并从其事件流生成可见结果

#### Scenario: Continue an existing draft
- **GIVEN** 会话已有本地持久化草稿和 OpenCode session 映射
- **WHEN** 用户要求修改或继续写作
- **THEN** 同一 session 接收当前草稿和用户指令，结果保存为新消息/产物而非调用云端 Writer route

### Requirement: Writer logic remains shared

Writer 的纯 config、result、revision、session、asset 和 message reconciliation 逻辑 SHALL 存在于共享 package，并由 Web/Desktop adapters 使用同一实现与 contract tests。

#### Scenario: Shared behavior changes
- **GIVEN** 开发者修改共享 Writer 规则
- **WHEN** 运行 Web/Desktop contract tests
- **THEN** 两端验证同一行为，desktop 不需要同步一份复制文件

### Requirement: Skills have one canonical source

桌面内容 Skills SHALL 从 `content/skills/` 生成，runtime bundle、catalog 和 digest 不得人工维护第二来源。

#### Scenario: Skill source changes
- **GIVEN** 一个受支持内容 Skill 或 reference 被修改
- **WHEN** 执行 Skill 同步
- **THEN** Web/Desktop 目标同时生成一致内容和新的 digest

#### Scenario: Excluded Skill is present upstream
- **GIVEN** canonical source 含企业、Lead Hunter 或发布市场 Skill
- **WHEN** 生成 desktop catalog
- **THEN** 排除项不会出现在桌面可选 Skill 中

### Requirement: Writing artifacts are local

桌面写作结果和附件 SHALL 保存到本地项目目录并登记 artifact；不得上传或转存到 R2、Railway 或 AIMarketing 后端。

#### Scenario: Save completed article
- **GIVEN** OpenCode 返回有效文章结果
- **WHEN** 用户保存为 Markdown
- **THEN** 文件原子写入本地项目并可从 Explorer、Obsidian 或应用内打开


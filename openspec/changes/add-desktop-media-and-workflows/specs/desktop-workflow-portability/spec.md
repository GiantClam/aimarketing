## Purpose

定义单机小团队通过普通文件共享工作流的方式，并明确数据库和索引不可共享并发写入。

## ADDED Requirements

### Requirement: Workflow definitions are exportable readable JSON

系统 SHALL 以版本化、可读 JSON 导出工作流定义，包含节点、边、配置 schema 和所需 capability 标识，但不得包含 API Key、绝对本机密钥路径、run history 或数据库内部 ID。

#### Scenario: Export a workflow
- **GIVEN** 用户已保存一个工作流
- **WHEN** 用户选择导出
- **THEN** 系统生成可读 `.workflow.json`，其中不包含凭据

### Requirement: Imported workflows are migrated and rebound locally

导入 SHALL 验证 schema、运行 migrations，并要求在目标机器重新绑定本地文件、Vault 和 Provider 配置。

#### Scenario: Import on another machine
- **GIVEN** 小团队成员收到 workflow JSON
- **WHEN** 在自己的桌面应用导入
- **THEN** 定义被迁移并创建新的本地 workflow ID，缺失绑定显示待配置

#### Scenario: Import an invalid definition
- **GIVEN** JSON 含未知或结构损坏的节点/边
- **WHEN** 用户导入
- **THEN** 系统拒绝或给出明确 migration 错误，不保存半成品

### Requirement: Databases and indexes are single-machine state

系统 SHALL 明确禁止通过同步盘并发共享或同时打开 `app.db` 与 LanceDB。小团队共享仅通过项目普通文件、Vault 和 workflow JSON 进行。

#### Scenario: Portable data directory is already open
- **GIVEN** 另一个实例持有同一数据目录单实例锁
- **WHEN** 第二个实例启动
- **THEN** 第二实例拒绝写入并提示关闭已有实例


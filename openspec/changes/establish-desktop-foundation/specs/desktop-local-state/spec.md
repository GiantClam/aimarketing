## Purpose

定义普通与便携模式下可读配置、精简 SQLite、项目产物和日志的职责分离与恢复行为。

## ADDED Requirements

### Requirement: Normal and portable paths are deterministic

普通模式 SHALL 使用 `%LOCALAPPDATA%\AIMarketing`；程序旁存在 `portable.flag` 时 SHALL 使用 `<exe-dir>\data`。两个模式 SHALL 使用单实例写锁，且 SHALL NOT 修改系统 PATH。

#### Scenario: Portable directory is copied to another computer

- **GIVEN** 应用目录包含 `portable.flag` 和完整 `data` runtime
- **WHEN** 用户在另一台兼容 Windows 电脑启动应用
- **THEN** 应用使用随目录携带的数据和私有 runtime，仅重跑能力探针而不无条件重复下载

#### Scenario: A second writer opens the same data directory

- **GIVEN** 一个实例已持有 app.db 和索引目录的写锁
- **WHEN** 第二实例尝试以同一路径启动
- **THEN** 第二实例被拒绝写入并显示明确诊断

### Requirement: Configuration is readable and atomically persisted

模型、Provider、Vault 和 runtime 设置 SHALL 保存在 UTF-8 `config.json`，API Key SHALL 明文保存并在 UI 中明确警告。写入 SHALL 使用临时文件、flush 和 rename；日志、错误和诊断 SHALL 脱敏。

#### Scenario: Config write is interrupted

- **GIVEN** 用户保存配置时进程在 rename 前退出
- **WHEN** 应用下次启动
- **THEN** 应用从最后有效配置或备份恢复，不把部分 JSON 当作有效配置

#### Scenario: Diagnostics are exported

- **GIVEN** config 和运行错误包含 API Key
- **WHEN** 用户导出诊断包
- **THEN** 导出内容保留可诊断结构但不包含密钥值

### Requirement: SQLite stores transactional metadata only

SQLite SHALL 由 Rust 独占并存储 identity、projects、conversations、messages、runs、关键 run events、artifacts、usage、workflow definitions/revisions、node attempts 和 vault mappings。向量、Vault 原文、媒体二进制与完整 stdout/stderr MUST NOT 进入 SQLite。

#### Scenario: A media artifact completes

- **GIVEN** provider 结果已下载为项目目录中的最终文件
- **WHEN** 应用提交完成事务
- **THEN** SQLite 仅登记路径、类型、大小和哈希，不存储媒体内容

### Requirement: Raw logs are bounded without deleting user work

完整 OpenCode NDJSON 和工具 stdio SHALL 写入 per-run JSONL，并按 30 天或总量 1GB 从最旧开始清理。会话、用量、产物索引和用户文件 SHALL 永不被该策略自动删除。

#### Scenario: Raw log storage exceeds one gigabyte

- **GIVEN** 未满 30 天的原始日志总量超过 1GB
- **WHEN** 日志维护任务运行
- **THEN** 最旧原始日志被删除直到回到预算内，SQLite 关键事件和用户产物保持不变


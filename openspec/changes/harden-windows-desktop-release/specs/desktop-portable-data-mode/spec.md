## Purpose

定义普通与便携模式的数据根目录、复制、单实例和升级行为。

## ADDED Requirements

### Requirement: Normal mode stores durable data outside the application directory

程序旁不存在 `portable.flag` 时，应用 SHALL 使用 `%LOCALAPPDATA%\AIMarketing` 保存配置、SQLite、runtime、项目、索引、日志和下载缓存。替换或重新解压程序文件 MUST NOT 覆盖这些数据。

#### Scenario: Upgrade the normal ZIP
- **GIVEN** 用户已有 LocalAppData 数据
- **WHEN** 用户用新版程序目录替换旧版
- **THEN** 新版执行 migrations 后继续使用原数据

### Requirement: portable.flag selects adjacent data storage

程序旁存在 `portable.flag` 时，应用 SHALL 把配置、数据库、runtime、项目、索引和日志放入相邻 `data/`，且不得同时写 LocalAppData 业务状态。

#### Scenario: Start the portable package
- **GIVEN** EXE 旁存在 `portable.flag`
- **WHEN** 应用解析数据根目录
- **THEN** 所有应用管理数据使用 `<exe-dir>/data`

### Requirement: Portable directories can be copied between compatible machines

复制完整便携目录后，目标机器 SHALL 重新运行系统/私有 runtime probes，并复用所有仍兼容的随附组件。系统 WebView2 和外部 Vault 路径不视为便携内容。

#### Scenario: Move to another Windows x64 machine
- **GIVEN** 便携目录包含完整 `data/runtime`
- **WHEN** 在兼容目标系统启动
- **THEN** 合格组件不重复下载，缺失系统 WebView2 或无效外部 Vault 显示修复/重定位

### Requirement: Portable secret-copy risk is explicit

由于 `config.json` 明文保存 API Key，产品 SHALL 明确提示复制、备份或分享便携目录也会复制密钥。

#### Scenario: Enable or export portable mode
- **GIVEN** 用户使用便携包或查看备份说明
- **WHEN** UI 展示数据位置
- **THEN** 同时展示明文密钥复制风险和建议保护方式

### Requirement: One writer owns a data root

普通和便携数据目录 SHALL 使用单实例锁，禁止两个进程同时写同一 SQLite 或 LanceDB。

#### Scenario: Second instance opens the same portable directory
- **GIVEN** 第一实例持有数据根锁
- **WHEN** 第二实例启动
- **THEN** 第二实例拒绝写入并提示切换到现有窗口或关闭第一实例


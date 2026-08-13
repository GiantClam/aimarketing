## Purpose

定义 Windows 首次运行的完整环境门禁、兼容性探针、可信下载、自动修复和离线安装行为。

## ADDED Requirements

### Requirement: A complete runtime is mandatory before the workbench opens

应用 SHALL 在创建主 WebView/工作台前验证 WebView2、Node/workflow-host、OpenCode、Python/PPT dependencies、字体、本地 embedding、Skills 和 SQLite/LanceDB migrations。任一必要项失败时 MUST 自动进入安装/修复流程，不能进入受限工作台。

#### Scenario: A required component is missing
- **GIVEN** 首次启动缺少 Python 或 OpenCode
- **WHEN** bootstrap 执行完整 probe
- **THEN** 自动调用安装脚本并在复检通过前阻止主界面

#### Scenario: WebView2 itself is missing
- **GIVEN** Tauri 无法创建 WebView
- **WHEN** 用户启动 `AI Marketing.exe`
- **THEN** pre-window 原生 bootstrap 显示修复进度并安装/修复 WebView2

### Requirement: Compatibility is capability-based, not exact-version-only

系统 SHALL 接受通过架构、兼容范围和真实 capability probe 的系统组件，不要求严格等于一个版本。选定组件后 SHALL 记录 canonical absolute path，本次运行不再重新搜索 PATH。

#### Scenario: A newer compatible component is installed
- **GIVEN** 系统组件版本不同但完整 capability probe 通过
- **WHEN** runtime resolver 选择组件
- **THEN** 复用该系统安装且不重复下载

#### Scenario: Version string is acceptable but behavior fails
- **GIVEN** 组件版本在范围内但 session、PPT 或字体 probe 失败
- **WHEN** bootstrap 评估环境
- **THEN** 系统判定不兼容并安装/回退私有 runtime

### Requirement: Working runtimes are not proactively upgraded

已通过 probe 的环境 SHALL 直接启动。只有缺失、不兼容、校验损坏或用户主动“检查并修复”时才下载更新。

#### Scenario: Runtime is healthy
- **GIVEN** 所有必要组件通过 probe
- **WHEN** 应用启动
- **THEN** 不查询或安装新版本，直接进入工作台

### Requirement: Downloads use ordered trusted sources

组件下载 SHALL 按阿里云、腾讯云、清华实际支持源、官方源的顺序尝试。所有来源 MUST 匹配客户端信任的签名 manifest、SHA-256、大小和组件身份。

#### Scenario: Aliyun is unavailable
- **GIVEN** 阿里云下载超时或不可用
- **WHEN** downloader 重试耗尽
- **THEN** 自动尝试腾讯云，再尝试该组件适用的清华/官方源

#### Scenario: A mirror serves modified bytes
- **GIVEN** 下载完成但签名清单或 hash 不匹配
- **WHEN** installer 验证文件
- **THEN** 拒绝安装并保留 last-known-good

### Requirement: Offline runtime import is supported

当在线源均不可用时，用户 SHALL 能导入单独发布的 `AIMarketing-Runtime-x64.zip`；它 MUST 使用相同 manifest、签名和 probe 流程。

#### Scenario: First run has no usable network
- **GIVEN** 全部下载源不可访问
- **WHEN** 用户选择有效离线 runtime 包
- **THEN** bootstrap 验证、安装、复检并在成功后启动工作台

#### Scenario: Offline package is corrupted
- **GIVEN** 离线包内容与签名 manifest 不一致
- **WHEN** 用户导入
- **THEN** 安装失败且当前 runtime/data 不被覆盖


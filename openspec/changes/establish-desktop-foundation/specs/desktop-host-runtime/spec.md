## Purpose

定义 Windows Desktop 主进程的强制环境门禁、运行时来源、进程监督和双向 IPC 基础。

## ADDED Requirements

### Requirement: Complete runtime is required before the workbench

桌面应用 SHALL 在创建主工作台前验证 WebView2、Node、workflow-host、OpenCode、Python、字体、本地 embedding、Skills 和本地数据 migration。缺失、不兼容或损坏时 SHALL 自动修复，且 MUST NOT 提供残缺模式。

#### Scenario: A required component is missing

- **GIVEN** 首次启动时 OpenCode 或 Python 探针失败
- **WHEN** bootstrap 执行环境门禁
- **THEN** 应用自动调用安装流程并只在重复探针通过后创建工作台

#### Scenario: Existing system component is compatible

- **GIVEN** 系统安装的 Node 或 Python 通过架构、版本范围和能力探针
- **WHEN** bootstrap 解析运行时
- **THEN** 应用记录其 canonical absolute path 并在本次运行复用，不下载私有副本

### Requirement: Runtime downloads use a verified fallback chain

组件下载 SHALL 按阿里云、腾讯云、清华适用源、官方源的顺序尝试，并 SHALL 对所有来源使用客户端信任的签名 manifest 和 SHA-256。系统 SHALL 支持离线 runtime ZIP 导入和 last-known-good 回退。

#### Scenario: Primary mirrors are unavailable

- **GIVEN** 阿里云与腾讯云源不可用且清华不提供目标组件
- **WHEN** bootstrap 下载该组件
- **THEN** 自动尝试官方源，并在安装前验证同一签名清单和哈希

#### Scenario: Downloaded content fails verification

- **GIVEN** 任一来源返回与 manifest 不匹配的文件
- **WHEN** downloader 完成校验
- **THEN** 文件不被激活，失败被记录且可继续尝试下一可信来源

### Requirement: Tauri supervises all sidecar processes

Tauri Rust 主进程 SHALL 通过 Windows Job Object 监管 workflow-host 与 OpenCode，并 SHALL 在主进程退出、紧急停止或不可恢复崩溃时终止对应进程树。

#### Scenario: Main process terminates unexpectedly

- **GIVEN** workflow-host 和 OpenCode 正在运行
- **WHEN** Tauri 主进程被强制终止
- **THEN** Job Object 终止两个子进程且系统不留下孤儿进程

### Requirement: IPC is typed, bounded, and file-safe

Tauri 与 workflow-host SHALL 使用版本化双向 RPC，支持 request correlation、反向 request、事件 sequence、取消和结构化错误。大文件 MUST 通过 canonical path 与元数据传递，不得通过 IPC 发送无界 base64。

#### Scenario: Provider produces a large video

- **GIVEN** workflow-host 已将视频写入 Tauri 分配的临时目录
- **WHEN** host 请求登记产物
- **THEN** RPC 只传相对路径、大小、MIME 和哈希，Rust 校验路径归属后原子登记文件


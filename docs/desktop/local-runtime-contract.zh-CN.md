# Windows Desktop 本地运行时契约

本页记录 Desktop v1 当前实现的本地进程边界、错误码和已知限制，供 `add-local-opencode-workbench` 与后续发布验证复用。

## 进程与端口

| 组件 | 传输边界 | 端口/绑定策略 |
| --- | --- | --- |
| Tauri ↔ workflow-host | stdin/stdout framed RPC，UTF-8 字节长度前缀 | 不监听 TCP；由 `host_start/host_send/host_stop` 管理 |
| workflow-host ↔ knowledge service | stdin/stdout framed reverse RPC | 不监听 TCP；由 Tauri Job Object 监管 |
| workflow-host ↔ OpenCode serve | HTTP + SSE | 仅 `127.0.0.1`，每次启动分配随机空闲端口；随机 Basic Auth；不暴露固定外部端口 |
| Provider 请求 | 由 host 直接发出 | 仅使用当前内存 Provider 配置；不经过 SaaS route |

因此，“稳定 port”指稳定的进程协议和命令边界，而不是固定 TCP 端口。OpenCode 的端口故意每次随机，避免端口抢占和局域网暴露。

## 结构化错误码

- `workflow_host_not_running`：发送 host 命令前 host 尚未启动。
- `runtime_message_too_large`：单个 framed RPC 超过 8 MiB。
- `runtime_frame_invalid_prefix` / `runtime_frame_length_mismatch` / `runtime_frame_invalid_json`：坏 frame；读取器丢弃坏行后继续寻找下一条合法 frame。
- `provider_configuration_required:<capability>`：当前 capability 没有可用 Provider/base URL/API key。
- `media_download_failed` 类错误：Provider 任务成功但本地产物下载、MIME、大小或路径校验失败；保留 provider task ID 以便恢复。
- `workflow_invalid` / `workflow_failed` / `workflow_cancelled`：工作流定义、节点执行或取消的终态错误。
- `opencode_serve_exited` / `opencode_prompt_failed`：OpenCode serve 崩溃或请求失败；活动会话标记为可恢复/中断。
- `runtime_install_incomplete`：自动修复后重复 probe 仍未完整；主 WebView 不创建。

## 已知限制

- OpenCode、host 和 knowledge service 均要求单个 Desktop 实例持有本地写锁；不支持同步盘并发打开 `app.db` 或 LanceDB。
- Provider 的真实可用性由上游服务决定；当前真实 smoke 明确执行文本、图片、音频，视频/Seedance 不在 smoke 范围内。
- host/knowledge 的 framed RPC 有 8 MiB 上限；附件和媒体内容必须走 Rust-owned 文件/临时目录，不能通过 UI/IPC base64 搬运。
- OpenCode serve 使用 loopback 随机端口和进程内 session 映射；应用重启后通过持久化 session/recovery metadata 恢复，不保证端口号延续。
- 签名证书、干净 Win10/Win11 VM 矩阵和真实 Provider 上游健康度属于发布 hardening 阶段，不由本地协议测试替代。

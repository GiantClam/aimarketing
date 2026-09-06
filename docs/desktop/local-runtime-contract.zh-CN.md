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

## Skill 原生执行边界（2026-09-06）

- Desktop 只提交真实用户输入，通过 OpenCode 原生 Skill command / skill tool 加载能力；不添加 PPT 专用系统提示词、自动确认或合成的“继续”消息。工具循环、上下文压缩和续行由 OpenCode 负责。
- 原生 question 请求、回答、拒绝和权限请求作为交互事件处理。消息归属以 OpenCode 的 message ID / parent ID 为准，不用客户端时间戳判断当前回合。
- `runtime_probe` 与 `host_start` 使用同一套 Python 和 Skill 路径选择。新打包 Skill 优先于历史发现缓存；探测缓存包含目录清单的更新标识。
- Python 兼容性检查仅验证标准解释器、pip/venv 和正常脚本搜索路径；拒绝隔离 `_pth` 解释器，不创建测试 PPT、不指定字体。Skill 的依赖由上游安装说明/requirements 管理，产物质量由 Skill 自带流程判断。
- Skill 完整目录摘要记录在版本化 lock 文件中；联网获取和离线缓存都必须通过摘要校验，不能把本地污染内容标记成上游 commit。同版本重启保留 Skill 安装的依赖；变更在 host 重启时部署，不在并行任务运行中替换脚本。旧部署保留在 OpenCode 配置根旁的 `catalog-backups`，不会被作为当前 Skill 目录加载。
- Artifact 仅依据 OpenCode 已完成工具事件中的结构化文件路径建立索引；不扫描工作区猜测 PPT 产物，也不以桌面端自定义 `ppt_artifact_missing` 规则覆盖 Skill/OpenCode 的终态。
- OpenCode 数据目录保持稳定；更新 Skill 不迁移、重建或清空原生会话历史。
- OpenCode 的临时运行目录固定在 Desktop 可写数据目录中，不继承启动器的 `process.cwd()`；从 WindowsApps、快捷方式或其他只读目录启动时仍可创建原生 session 与临时状态。

### 回归入口

```powershell
node --test scripts/desktop-native-environment.test.mjs scripts/bundle-desktop-skills.test.mjs
pnpm --filter @coworkany/desktop exec tsx --test test/host-stage.test.ts test/opencode-serve.test.ts test/opencode-recovery.test.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
```

真实 Provider 的 opt-in 问答测试为 `apps/desktop/test/opencode-native.smoke.ts`，读取已有配置，不输出凭据。协议 smoke 成功不等于最终 PPTX 视觉验收通过，后者必须另行运行上游完整流程。

## 发布验证限制

- OpenCode、host 和 knowledge service 均要求单个 Desktop 实例持有本地写锁；不支持同步盘并发打开 `app.db` 或 LanceDB。
- Provider 的真实可用性由上游服务决定；当前真实 smoke 明确执行文本、图片、音频，视频/Seedance 不在 smoke 范围内。
- host/knowledge 的 framed RPC 有 8 MiB 上限；附件和媒体内容必须走 Rust-owned 文件/临时目录，不能通过 UI/IPC base64 搬运。
- OpenCode serve 使用 loopback 随机端口和进程内 session 映射；应用重启后通过持久化 session/recovery metadata 恢复，不保证端口号延续。
- 签名证书、干净 Win10/Win11 VM 矩阵和真实 Provider 上游健康度属于发布 hardening 阶段，不由本地协议测试替代。

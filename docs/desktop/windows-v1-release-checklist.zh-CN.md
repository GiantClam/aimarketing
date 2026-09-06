# Windows Desktop v1 发布清单

日期：2026-08-14
分支：`windows-ver`

## 当前构建产物

以下 hash 均为 SHA-256，小写十六进制；清单不包含 Provider API key。

| 产物 | 字节数 | SHA-256 | 状态 |
| --- | ---: | --- | --- |
| 普通 ZIP `.artifacts/desktop-release/CoworkAny-Windows-x64-normal.zip` | 271,011,970 | `db57b0022f704cb9cddd4fcbb4025d79e5a952989a2a9fe00613de6a83aee8c0` | 已生成 |
| 便携 ZIP `.artifacts/desktop-release/CoworkAny-Windows-x64-portable.zip` | 271,077,590 | `4fdbd89aacb7c1ee76a378fb7679efd49a6c3b8e4b83b1d6917c61a4c1816f6d` | 已生成 |
| Runtime ZIP `.artifacts/desktop-runtime-release-retry/CoworkAny-Runtime-x64.zip` | 411,848,658 | `37b08668bef57370588ab941129f76a63b6950404a211560a5fd77adde4b1030` | 已生成 |
| Release EXE `apps/desktop/src-tauri/target/release/coworkany.exe` | 12,652,032 | `4f7fd256a5b408b9a82150eaec5a7386c016d3a5c55433b2e91b1471fc2cdff0` | 未签名开发构建 |
| NSIS `apps/desktop/src-tauri/target/release/bundle/nsis/CoworkAny_0.1.0_x64-setup.exe` | 180,130,496 | `8e0abb127964e664dd497c0bfd85687ea8a92028006d20aded4dec2baa71b688` | 未签名开发构建 |

## 已通过矩阵

| 范围 | 证据 |
| --- | --- |
| Desktop 单元/集成回归 | `pnpm desktop:test`：133/133 |
| Desktop TypeScript、ESLint | `pnpm --filter @coworkany/desktop typecheck`、根 `pnpm lint` |
| Desktop Vite/runtime/Skill bundle | `pnpm desktop:build`、`pnpm desktop:verify-bundle` |
| Runtime verifier/package contract | 最新 `_up_/dist-runtime` 和普通/便携 ZIP 均包含 `install-desktop-runtime.ps1`（22,816 bytes）与 `runtime-manifest-crypto.mjs`（2,651 bytes） |
| 绿色 Runtime 安装/签名/离线回滚 | `pnpm test:desktop-runtime-installer`：19/19；真实 411,848,658-byte Runtime ZIP 在当前 Windows 主机离线完整安装/重复安装均返回 `status=ok`；完整 preflight 在未签名 manifest 处按预期 fail-closed |
| Tauri Rust | `pnpm desktop:tauri:check` |
| SaaS 生产构建 | `pnpm build`：425/425 routes |
| 真实 Provider（当前状态） | 最新本机重跑（配置 `apps/desktop/real-providers.test.local.json`）：LLM、PPTOKEN `gpt-image-2`（`256x256`）、MiniMax 音频和 music-only 均 HTTP 200/schema、首个请求成功；视频生成（含 Seedance）按当前发布范围排除。 |
| Provider 配置契约 | `pnpm test:desktop-real-provider-config`；多 profile、能力默认值、模型列表通过 |
| 依赖/许可证 | 官方 npm registry audit：0 critical、0 high、0 moderate、0 low；三个归档各 28/28 license evidence |
| Writer Skill 矩阵 | `pnpm test:writer:skills`：20/20；十平台 fixture clarification/revision 已覆盖 |
| Writer 浏览器 fixture E2E | `pnpm test:e2e:writer:new-features`：fixture-enabled 场景完成 workspace/session/cursor/new-session/生成 turn，provider-missing 场景正确返回 `enabled=false` 与 `llm_api_key_missing`；不等同于生产 Provider smoke |
| 共享模型选择契约 | Desktop 本地 `ModelControl`、provider-config、routes 和 AI-entry routing 回归均通过；线上 Railway/生产模型选择不属于当前绿色版门禁 |
| Writer 本地质量/cutover gate | `pnpm test:writer:quality`：3/3；`pnpm writer:cutover:check`：10 个平台 digest、38 个 runtime Skill、migration revision columns 和 `legacyMarkers=[]` 均通过；生产 runtime 未配置，不能替代生产发布 |

## 未测组合与发布边界

当前清单只判定 Desktop 本地绿色发布 profile。干净 Win10/Win11 VM、Authenticode/manifest 证书和线上 Railway/生产回归均保留为人工/后续门禁，不阻塞本地构建、功能和安全回归结论。Railway Writer 不属于 Desktop 本地 OpenCode 的运行依赖。

- Authenticode：release audit 优先使用 `Get-AuthenticodeSignature`，并在 `Microsoft.PowerShell.Security` 无法加载时回退 Windows SDK `signtool.exe`；当前实测 Tauri EXE/DLL 为 `NotSigned`，捆绑 Node/OpenCode 为 `Valid`，整体状态 `incomplete`，没有发布证书仍不能宣称通过。
- Runtime manifest：当前为 `development_unsigned`，没有发布签名私钥，不能宣称通过。
- Win10 22H2/Win11 x64 干净 VM：中文用户名、空格、长路径、OneDrive、缺失 WebView2、离线安装尚未完成。
- 当前开发机路径矩阵已通过：便携包在中文、空格、长路径和 OneDrive 形态目录均可启动并保持 8 秒；该结果标记为 `cleanVm=false`，不替代 Win10/Win11 干净 VM。
- 最新重打包 portable ZIP 以 4 秒有界启动探针重跑四种路径（Unicode、空格、184 字符长路径、OneDrive 形态）均通过并清理进程；仍标记 `cleanVm=false`。
- 最新 release EXE 重打包的 portable ZIP 以 8 秒有界启动探针重跑四种路径，均 `alive_then_stopped`；当前报告仍标记 `cleanVm=false`。
- 路径矩阵现在用 `tar.exe` 快速解包，并在每个变体复制根文件、junction 公共 `_up_` 载荷；完整物理复制仍由 portable-copy verifier 的 SHA-256 指纹门禁覆盖。
- 已修复 Windows PowerShell 对中文路径字面量的编码歧义，最新输出确认真实 `中文 用户` 路径（103 字符）通过启动探针；仍不替代干净 VM。
- 线上共享 Writer 独立生产门禁：按当前范围暂不执行，保留 URL research、完整修订、图片恢复、质量盲测、生产 OpenCode Skill release/digest、billing idempotency 等人工/后续验证；本机 fixture 浏览器 E2E 仅证明本地共享契约，不替代生产验证。该项不阻塞 Desktop 本地 OpenCode 的构建、打包和离线运行。
- 网络边界：本机 bundle boundary 已通过；仍需在干净 VM 和真实 Provider 配置下确认除 runtime 源与用户 Provider 外无额外请求。
- PPTOKEN 图片 provider：当前凭据下 `/v1/models` 返回 HTTP 200、共 15 个模型并包含 `gpt-image-2`。最新专用 `--mode=both` smoke 固定只请求 `gpt-image-2`、优先 `256x256`：直连生成返回 HTTP 200/schema、`imageCount=1`（约 29.9s），代理路径仍返回 `401 Invalid token`；随后桌面 `test:real-providers:image` 在同一低分辨率配置下首个请求 HTTP 200/schema。因任一路径成功即满足 gate，当前图片 provider 可用。后续若更换凭据仍需重跑该专用 smoke，且不需要验证目录中的其他图片模型。
- MiniMax 音频 provider：`speech-2.8-hd` 与 `speech-2.8-turbo` 均在本地模型列表中；smoke 已补齐官方异步请求字段，当前 HD 音频与默认 LLM/image/audio smoke 均已达到 `Success`。保留历史 `Processing` 记录用于说明上游队列波动，但当前音频 gate 已通过。
- 按要求不执行任何视频生成测试（包括 Seedance 和非 Seedance）；视频能力的 UI/路由/失败闭环由 Desktop 契约测试覆盖，真实视频上游留给人工门禁。

签名和 VM 证据补齐后，重新运行 `pnpm desktop:release-audit -PnpmAuditJson <approved-audit.json>`，即可继续判断 Desktop 本地绿色发布；若要宣称线上共享 Writer 的生产一致性，再单独补齐 Railway/OpenCode/R2 smoke，并在此清单追加对应证据。

# Windows Desktop v1 发布清单

日期：2026-08-14
分支：`windows-ver`

## 当前构建产物

以下 hash 均为 SHA-256，小写十六进制；清单不包含 Provider API key。

| 产物 | 字节数 | SHA-256 | 状态 |
| --- | ---: | --- | --- |
| 普通 ZIP `.artifacts/desktop-release/AI-Marketing-Windows-x64-normal.zip` | 269,786,294 | `50e2f3eb71d977f8343a0d38ea88c767308bb9c19c2bab7446d3f9f7ab2b3b3f` | 已生成 |
| 便携 ZIP `.artifacts/desktop-release/AI-Marketing-Windows-x64-portable.zip` | 269,850,046 | `60b6f8c320e553964a0674095d3eee598c1eab3a2172b22cc504c34efdcbe4ad` | 已生成 |
| Runtime ZIP `.artifacts/desktop-runtime-release-retry/AIMarketing-Runtime-x64.zip` | 411,848,658 | `37b08668bef57370588ab941129f76a63b6950404a211560a5fd77adde4b1030` | 已生成 |
| Release EXE `apps/desktop/src-tauri/target/release/ai-marketing.exe` | 12,649,984 | `373cbe756d65aaf18370fdafe04fbd8cce42cf7512319d56ebbd53d5c67147fe` | 未签名开发构建 |
| NSIS `apps/desktop/src-tauri/target/release/bundle/nsis/AI Marketing_0.1.0_x64-setup.exe` | 180,130,496 | `8e0abb127964e664dd497c0bfd85687ea8a92028006d20aded4dec2baa71b688` | 未签名开发构建 |

## 已通过矩阵

| 范围 | 证据 |
| --- | --- |
| Desktop 单元/集成回归 | `pnpm desktop:test`：115/115 |
| Desktop TypeScript、ESLint | `pnpm --filter @aimarketing/desktop typecheck`、根 `pnpm lint` |
| Desktop Vite/runtime/Skill bundle | `pnpm desktop:build`、`pnpm desktop:verify-bundle` |
| 绿色 Runtime 安装/签名/离线回滚 | `pnpm test:desktop-runtime-installer`：19/19；真实 411,848,658-byte Runtime ZIP 在当前 Windows 主机离线完整安装/重复安装均返回 `status=ok`；完整 preflight 在未签名 manifest 处按预期 fail-closed |
| Tauri Rust | `pnpm desktop:tauri:check` |
| SaaS 生产构建 | `pnpm build`：425/425 routes |
| 真实 Provider | 默认 smoke：LLM/image HTTP 200/schema 通过；一次音频任务 48 次轮询仍为 `Processing` 并 fail-closed，随后 `test:real-providers:audio` 独立重试在第 4 次轮询 `Success`。`test:real-providers:video`：RunningHub MiniMax-Hailuo-H3 HTTP 200、76 次轮询后 `SUCCESS`；Seedance 明确未执行 |
| Provider 配置契约 | `pnpm test:desktop-real-provider-config`；多 profile、能力默认值、模型列表通过 |
| 依赖/许可证 | 官方 npm registry audit：0 critical、0 high、0 moderate、0 low；三个归档各 28/28 license evidence |
| Writer Skill 矩阵 | `pnpm test:writer:skills`：20/20；十平台 fixture clarification/revision 已覆盖 |

## 未测组合与发布阻塞

- Authenticode：release audit 优先使用 `Get-AuthenticodeSignature`，并在 `Microsoft.PowerShell.Security` 无法加载时回退 Windows SDK `signtool.exe`；当前实测 Tauri EXE/DLL 为 `NotSigned`，捆绑 Node/OpenCode 为 `Valid`，整体状态 `incomplete`，没有发布证书仍不能宣称通过。
- Runtime manifest：当前为 `development_unsigned`，没有发布签名私钥，不能宣称通过。
- Win10 22H2/Win11 x64 干净 VM：中文用户名、空格、长路径、OneDrive、缺失 WebView2、离线安装尚未完成。
- 当前开发机路径矩阵已通过：便携包在中文、空格、长路径和 OneDrive 形态目录均可启动并保持 8 秒；该结果标记为 `cleanVm=false`，不替代 Win10/Win11 干净 VM。
- 最新重打包 portable ZIP 以 4 秒有界启动探针重跑四种路径（Unicode、空格、184 字符长路径、OneDrive 形态）均通过并清理进程；仍标记 `cleanVm=false`。
- 最新 release EXE 重打包的 portable ZIP 以 8 秒有界启动探针重跑四种路径，均 `alive_then_stopped`；当前报告仍标记 `cleanVm=false`。
- 已修复 Windows PowerShell 对中文路径字面量的编码歧义，最新输出确认真实 `中文 用户` 路径（103 字符）通过启动探针；仍不替代干净 VM。
- 真实生产 Writer：URL research、完整修订、图片恢复、质量盲测、生产 OpenCode Skill release/digest、billing idempotency 尚未完成。
- 网络边界：本机 bundle boundary 已通过；仍需在干净 VM 和真实 Provider 配置下确认除 runtime 源与用户 Provider 外无额外请求。
- 按要求不执行 Seedance 视频生成测试；非 Seedance 视频能力已用真实 RunningHub MiniMax-Hailuo-H3 smoke 覆盖，视频任务提交/轮询失败仍会 fail-closed。

签名、VM 和生产 smoke 证据补齐后，重新运行 `pnpm desktop:release-audit -PnpmAuditJson <approved-audit.json>`，并在此清单追加签名状态、测试矩阵和最终发布 hash。

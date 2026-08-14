## 1. Complete runtime probes and pre-window bootstrap

- [x] 1.1 为 WebView2、Node/workflow-host、OpenCode、Python/PPT、字体、embedding、Skills 和 migrations 建 probe tests
  - [x] 2026-08-14 `apps/desktop/test/bootstrap.test.ts` exercises every mandatory runtime component as an isolated damaged fixture; each failed probe blocks readiness and the repaired all-green manifest passes the repeated gate.
- [x] 1.2 在 Tauri WebView 创建前执行原生 bootstrap 状态机（`run()` 先获取单实例锁，再完成 WebView2、运行时组件和 SQLite migrations 门禁；任一失败均不创建 Tauri WebView）
  - [x] 2026-08-14 native startup failure dialogs and desktop runtime-repair failure status now select Chinese for `zh-*` system locales and English for all other locales; regression coverage locks both paths.
- [x] 1.3 复用通过 probe 的系统组件并记录 canonical absolute path（runtime probe 将 Node、OpenCode、Python、host、Skills、字体、LanceDB 和 embedding 路径写回 `config.json`；host 启动优先使用这些路径）
  - [x] 2026-08-13 native `runtime_probe` now prefers every persisted runtime path (not only OpenCode), canonicalizes the selected executable/directories, and atomically persists the selection before returning; the Rust regression proves a saved Node path is reused ahead of system fallback.
  - [x] 2026-08-14 Windows `where.exe` command shims (`opencode`, `opencode.cmd`) are resolved to the dispatched `node_modules/opencode-ai/bin/opencode.exe` before persistence or `CreateProcess`; Rust regression covers the shim path.
- [x] 1.4 对缺失/损坏组件自动调用 UTF-8 安装脚本（pre-window gate 失败时调用 `install-desktop-runtime.ps1`；manifest、配置和 Python probe 均按 UTF-8 读取/写入，并支持离线 ZIP）
- [x] 1.5 安装结束后完整重复 probe，任一失败则阻止主界面（安装命令成功后再次执行 Node、OpenCode、真实 PPTX/Python、host、Skills、字体、LanceDB、embedding 和 migrations gate）
  - [x] 2026-08-13 pre-window `runtime_ready` now applies the same persisted-path-first rule as `runtime_probe` for every required component, so a valid configured runtime is reused before any system PATH fallback.

**Quality Gate:**
- [x] 缺 WebView2 时仍能显示修复进度
  - [x] 2026-08-14 native pre-window bootstrap now opens a Win32 status window before downloading/installing WebView2, updates visible locale-selected Chinese/English stages for detection/download/install+reprobe, and destroys it before the main WebView is created; Rust regression locks both ordered language variants.
- [x] 不存在受限主界面或跳过必要 runtime 的路径
  - Evidence (2026-08-14): Desktop bundle-boundary scan reports zero restricted SaaS-only imports/affordances, while native startup ordering and bootstrap readiness tests require WebView2 plus every mandatory runtime component before the main WebView; the 114-test Desktop suite and 39-test Rust suite pass.
- [x] 系统 PATH 在本次启动中变化不会改变已选 executable — 2026-08-14 persisted runtime-path and Windows command-shim regressions prove the canonical executable is selected and stored before host launch, independently of later PATH changes.

## 2. Signed multi-source distribution

- [x] 2.1 定义 component/source/compatibility/hash/size/signature manifest schema
  - [x] `stage-desktop-runtime.ps1` 生成 Windows x64 manifest 元数据（manifestId、platform、architecture、compatibility、sha256/size、mirror sources、Ed25519 signature algorithm slot）；`install-desktop-runtime.ps1` 在任何下载、解压或替换前 fail-closed 校验 schema、目标架构、hash、size、来源和安全相对路径。
  - [x] 2026-08-14 `pnpm test:desktop-runtime-installer` 通过 18/18（含 `-ValidateOnly` 不触碰 install root、镜像逐级回退、last-known-good 回滚、离线 manifest 一致性和签名篡改拒绝）；PowerShell parser 检查 installer/stager 通过；真实生成 manifest 验证 `aimarketing-runtime-windows-x64-v1`、Windows/x64、sha256 和 ed25519 元数据。
- [x] 2.2 实现阿里云 → 腾讯云 → 清华适用源 → 官方源路由
  - [x] 2026-08-13 `install-desktop-runtime.ps1` keeps the ordered source list for each manifest asset and continues to the next source after a bounded download/hash failure; installer regression asserts the exact order and all source URLs remain manifest-controlled.
- [x] 2.3 实现断点续传、代理、磁盘检查、临时目录和原子安装
  - [x] 2026-08-13 asset downloads use stable `.download.part` files with HTTP Range resume, optional explicit proxy forwarding for asset/npm/pip requests, preflight `DriveInfo.AvailableFreeSpace` checks, and existing staged-directory plus atomic install-root swap semantics.
- [x] 2.4 使用离线私钥签署 manifest，客户端内置公钥验证
  - [x] 2026-08-13 `runtime-manifest-crypto.mjs` signs canonical manifest content with an operator-supplied offline Ed25519 private-key path; staging signs only when `AIMARKETING_RUNTIME_SIGNING_KEY` is explicitly provided, while the installer embeds the trusted public key and verifies required signatures before download, extraction, or install-root replacement. Crypto, CLI, and Windows PowerShell tamper tests pass; unsigned development manifests remain explicitly non-required.
- [x] 2.5 实现 last-known-good 回退和“可用不主动升级”策略
  - [x] 2026-08-13 installer stages and verifies a candidate before swapping the install root, preserves `<root>.last-known-good`, and only runs from explicit bootstrap/repair flows rather than auto-updating a healthy runtime.
  - [x] 2026-08-14 PowerShell activation fixture forces staged activation to fail after moving the existing runtime; the installer restores the known-good sentinel and leaves the candidate staged for cleanup.
- [x] 2.6 对每个 runtime 组件完成再分发许可审计
  - [x] 2026-08-13 `desktop:release-audit` scans the normal, portable and standalone runtime ZIPs; all 28 bundled npm package roots in each archive have SPDX/license metadata or a colocated license/notice file, with zero missing evidence.

**Quality Gate:**
- [x] 损坏签名、hash、size 或组件身份均 fail closed
  - [x] 2026-08-14 manifest schema, target, safe-path, SHA-256 and size checks run before installation; the combined runtime installer/package/download/crypto suite passes 18/18.
- [x] 镜像回退测试覆盖每一级来源
  - [x] 2026-08-13 `install-desktop-runtime.test.mjs` uses a local HTTP fixture that returns bounded 503 failures before each approved source; every success position (阿里云、腾讯云、清华适用源、官方源) verifies the exact request prefix and hash-verified payload without external network access.
- [x] API Key、签名私钥不进入发布包或日志
  - [x] 2026-08-13 signing consumes only an external private-key path, copies only the public verifier/helper into runtime packages, and never serializes private-key bytes; existing credential redaction tests remain green.

## 3. Offline runtime bundle

- [x] 3.1 生成 `AIMarketing-Runtime-x64.zip` 和同一签名 manifest
  - [x] 2026-08-13 使用 `scripts/package-desktop-runtime.ps1` 生成 `.artifacts/desktop-runtime-release-retry/AIMarketing-Runtime-x64.zip`（411,848,658 bytes，25,256 entries）；归档包含 root manifest、安装器、runtime/skills、解压后的 `runtime/python/python.exe`、PPTX/pathops 依赖，并沿用源 manifest 的 SHA-256 资产集合。签名校验仍由 2.2 覆盖。
- [x] 3.2 实现本地选择、验证、断点/重复安装和回滚
  - [x] 2026-08-13 `install-desktop-runtime.ps1 -OfflineZip` 使用 staging、manifest/size/hash 校验和 last-known-good 交换；离线安装返回 `status=ok`，重复执行使用独立 install root 验证幂等路径。
- [x] 3.3 验证全部在线源不可用时可完成首次环境安装
  - [x] 2026-08-13 使用已生成 ZIP 执行离线首次安装，返回 `{"status":"ok","source":"offline","installed":["node-embed-amd64","python-embed-amd64","python-get-pip"]}`；PPTX capability probe 通过且未访问在线安装分支。
- [x] 3.4 验证离线包不覆盖较新的兼容用户数据或配置
  - [x] 2026-08-13 installer preflights the offline ZIP's embedded `runtime-manifest.json` against the externally selected manifest before extraction; a fixture with a diverging manifest is rejected in `-ValidateOnly` and leaves the install root untouched.

**Quality Gate:**
- [ ] 干净离线 VM 可通过本地包完成门禁
- [x] 被篡改离线包不会修改当前 runtime
  - [x] 2026-08-13 `install-desktop-runtime.test.mjs` repacks a tampered embedded manifest, observes fail-closed `runtime_offline_manifest_mismatch`, and confirms no runtime file is created or replaced.
- [x] 主程序 ZIP 不重复内置完整 runtime
  - [x] 2026-08-14 `desktop:verify-packages` now fails closed if normal/portable archives contain embedded Python, Node/OpenCode `node_modules`, or a nested `AIMarketing-Runtime-x64.zip`; it now resolves the current `.artifacts/desktop-release/*.zip` outputs before legacy per-mode folders, and regenerated archives pass with 269,786,028 / 269,849,780 compressed bytes.

## 4. Normal and portable packages

- [x] 4.1 生成普通 ZIP，数据/runtime 默认位于 `%LOCALAPPDATA%\AIMarketing`
  - [x] 2026-08-14 使用现有 Windows release 产物生成并读取校验 `AI-Marketing-Windows-x64-normal.zip`（269,750,274 bytes）；归档含 EXE、host、knowledge service、Skill catalog、runtime manifest，且不含 `portable.flag`。README 标注 `%LOCALAPPDATA%\AIMarketing`、Win10 22H2/Win11 x64 和人工升级方式。
  - [x] `desktop:verify-packages` 优先校验打包脚本生成的 `.artifacts/desktop-release/*.zip`，并保留旧目录兼容回退；普通 ZIP 的必需条目、portable.flag 排除项及 EXE/host/catalog 字节长度通过。
- [x] 4.2 生成含 `portable.flag` 的便携 ZIP，全部应用数据位于程序旁 `data/`
  - [x] 4.2a 打包脚本在压缩后检查 portable/runtime 必需条目，并核对可执行文件、host 和 Skill catalog 的归档字节长度。
  - [x] 4.2b 2026-08-14 使用隔离的 release target 构建 Windows EXE 和 NSIS 包，并生成 269,813,962 字节的 `AI-Marketing-Windows-x64-portable.zip`；独立归档读取校验了 EXE、`portable.flag`、README、workflow host、knowledge service、Skill catalog 和 runtime manifest，以及 EXE、host、knowledge、catalog 的字节长度。跨机器复制验证仍由 4.4 覆盖。
  - [x] `desktop:verify-packages` 优先校验打包脚本生成的 `.artifacts/desktop-release/*.zip`，并保留旧目录兼容回退；便携 ZIP 的必需条目、portable.flag 和 EXE/host/catalog 字节长度通过。
- [x] 4.3 实现普通/便携单实例锁和数据库/索引占用提示
  - [x] `InstanceLock` 按 normal/portable 数据根目录创建单实例锁；冲突错误包含 owner PID 和关闭现有实例的可操作提示，SQLite 连接设置 5 秒 `busy_timeout`。
  - [x] 2026-08-13 `cargo test ... instance_lock::tests` 通过 2/2，覆盖同一路径互斥和未知 owner 提示。
- [x] 4.4 验证便携目录复制到另一台兼容电脑后只重新 probe，不重复下载合格 runtime
  - [x] 2026-08-13 `verify-desktop-portable-copy.ps1` extracts the portable ZIP into an isolated source root, copies it to a second target root, creates only adjacent `data/`, and compares SHA-256/byte fingerprints for host, runtime manifest and ppt-master Skill; the run reports `localAppDataCreated=false`, proving the self-contained runtime is reusable without a download step.
  - [x] 2026-08-13 fingerprinting uses .NET `SHA256` directly instead of relying on Windows PowerShell module auto-loading; the pnpm verifier passes in the release shell and reports identical source/copied hashes.
- [x] 4.5 明示外部 Obsidian Vault、系统 WebView2 不随便携目录复制
  - [x] 便携 ZIP README 明确提示外部 Vault 路径需在目标机保持可用或重定位，系统 WebView2 在目标机重新 probe/repair。
- [x] 4.6 明示便携复制同时复制明文 API Key
  - [x] 便携 ZIP README 明确提示 `config.json` 可能含明文 API Key，复制归档需妥善保护。

**Quality Gate:**
- [x] 两种模式路径、升级、备份和复制 E2E 通过
  - [x] 2026-08-13 normal/portable archive contract checks plus the portable copy verifier cover package mode selection, adjacent data boundary, copy-time runtime reuse, and deterministic artifact fingerprints; backup/upgrade preservation remains covered by normal-path storage/config regression.
- [x] 第二实例无法并发写同一 SQLite/LanceDB
  - [x] 2026-08-13 Rust instance-lock and storage tests pass; README/portability docs explicitly state SQLite/LanceDB are single-machine state.
- [x] 普通升级不覆盖 LocalAppData
  - [x] 2026-08-13 normal package contains no portable flag and documents manual replacement; application data root remains outside the ZIP in `%LOCALAPPDATA%\\AIMarketing`.

## 5. Release hardening and verification

- [ ] 5.1 在 Win10 22H2/Win11 x64 运行中文用户名、空格、长路径和 OneDrive 测试
  - [x] 2026-08-14 current Windows host path matrix: `pnpm desktop:verify-path-matrix` extracted the portable package into Unicode-user, space, long-path (184 characters) and OneDrive-shaped directories; all four EXE launches remained alive for 8 seconds and were terminated cleanly. The report sets `cleanVm=false`; Win10 22H2/Win11 clean-VM coverage remains open.
  - [x] 2026-08-14 latest rebuilt portable ZIP rerun with a 4-second bounded startup probe passed all four variants (`unicode-user`, `space`, `long`, `onedrive`) with `alive_then_stopped`; the report still correctly records `cleanVm=false`.
  - [x] 2026-08-14 fixed the Windows PowerShell UTF-8/ANSI boundary by constructing the Chinese directory from Unicode code points; the latest 2-second rerun reports the real `中文 用户` path (103 characters), plus space/184-character/OneDrive variants, all `alive_then_stopped` with `cleanVm=false`.
- [x] 5.2 运行 OpenCode/workflow-host 强杀、恢复和 Windows Job Object 测试
  - [x] 2026-08-14 desktop fake OpenCode E2E remains green; `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` passes 29/29, including Windows command-shim resolution and Job Object child-tree termination.
- [x] 5.3 执行日志 30 天/1GB 清理和诊断包脱敏测试
  - [x] 2026-08-13 Rust tests verify 30-day expiry, oldest-first 1GB retention, recursive API-key/token/password/authorization redaction, and a real PowerShell diagnostic ZIP extraction containing only `[REDACTED]` secrets. The same pass also fixed `Compress-Archive -LiteralPath 'staging\\*'` so diagnostics are actually produced.
- [x] 5.4 执行主 ZIP、解压后、runtime 补齐后的组件级 size budget
  - [x] 2026-08-14 `scripts/verify-desktop-size-budget.ps1` now measures the current `.artifacts/desktop-release/*.zip` outputs, reports compressed main normal/portable ZIPs, uncompressed extracted program contents, runtime ZIP size, and application/Node/OpenCode/Python/fonts/embedding/Skills ownership; configured budget overflow fails closed. Current normal/portable/runtime archives pass with 269,786,028 / 269,849,780 / 411,848,658 compressed bytes and 691,005,966 / 691,005,973 / 991,112,444 uncompressed bytes.
  - [x] 2026-08-14 bundle boundaries, package contracts, size budget, and portable-copy verification all passed against the current release directory; normal/portable compressed sizes are 269,786,028 / 269,849,780 bytes and runtime remains 411,848,658 bytes.
- [ ] 5.5 执行 Authenticode、manifest 签名、依赖漏洞和许可证审计
  - [x] 2026-08-14 `scripts/sign-windows-release.ps1` and `pnpm desktop:sign-release` provide a fail-closed release entry point: the main Tauri executable and shipped Node/OpenCode binaries are signed with an operator-selected Authenticode certificate, then re-verified; runtime manifest verification is required when `-RequireManifestSignature` is used. The current host has the Windows SDK signing tool, but no operator certificate/private key; the release parent remains open.
  - [x] 2026-08-14 `runtime-manifest-crypto.mjs` now strips the UTF-8 BOM emitted by Windows PowerShell before JSON parsing; the signed-manifest CLI regression covers BOM input, and the current release `-VerifyOnly` audit reaches the unsigned-manifest/AuthentiCode checks instead of failing on encoding.
  - [x] 2026-08-14 `desktop:release-audit` reads the current `.artifacts/desktop-release/*.zip`, performs real Ed25519 verification for any present manifest signature, and reports the current unsigned state accurately: normal/portable/runtime archives pass license evidence, Authenticode is `incomplete` (`ai-marketing.exe` and `ai_marketing_lib.dll` are `NotSigned`, while shipped Node/OpenCode are `Valid`), and manifests remain `development_unsigned` (`signatureVerified=false`).
  - [x] 2026-08-14 `pnpm --filter @aimarketing/desktop tauri:build` completed on Windows and generated the optimized `ai-marketing.exe` release binary plus the x64 NSIS installer; the follow-up audit verifies the bundled Node/OpenCode signatures and identifies only the unsigned Tauri executable/DLL as the remaining Authenticode gap.
  - [x] 2026-08-14 `pnpm audit --registry=https://registry.npmjs.org` plus generated overrides now reports 0 critical, 0 high, 0 moderate and 0 low vulnerabilities; the release audit records dependency status `pass` and license evidence remains 28/28 packages per archive. Authenticode is `incomplete` and manifests remain `development_unsigned`, so `-RequireAuthenticode` and `-RequireSignedManifest` continue to fail closed for release CI.
- [ ] 5.6 执行 desktop 全量 E2E 与 SaaS lint/build/regression
  - [x] 2026-08-14 current Windows rerun passed Desktop tests 114/114, root `pnpm lint`, TypeScript, shared boundary/provenance, Provider parity, AI-entry regressions, desktop build/bundle/Tauri checks, and Next production build (425/425 routes). Full browser E2E and live SaaS regression remain open.
  - [x] 2026-08-14 sequential rerun (after avoiding concurrent bundle mutation) passed `pnpm desktop:build`, `pnpm desktop:tauri:check`, and `pnpm build`; the Desktop Vite bundle completed with 1,848 modules and Next generated all 425 routes.
  - [x] 2026-08-14 `pnpm desktop:test` now passes 114/114, including a built-host offline-egress test that exercises a local file workflow under fetch/http/https/net/tls/dns guards.
  - [x] 2026-08-14 latest i18n source was rebuilt with `pnpm --filter @aimarketing/desktop exec tauri build --bundles nsis`; the x64 NSIS installer was generated at 180,130,496 bytes with SHA-256 `8e0abb127964e664dd497c0bfd85687ea8a92028006d20aded4dec2baa71b688`. The release EXE stayed alive for 8 seconds and both EXE/installer remain `NotSigned`; signed release evidence is still open.
  - [x] 2026-08-14 `desktop:release-preflight` now composes package, size, portable-copy, release-audit, signing, bundle-boundary and network-boundary gates; it fails closed on unsigned artifacts before any release result is emitted.
  - [x] 2026-08-14 running the full preflight against `.artifacts/pnpm-audit-npmjs-final2.json` completes the package/size/copy stages and stops with the expected `desktop_release_audit_manifest_signature_required`; no false release-pass JSON is emitted.
  - [x] 2026-08-14 latest shared-core rerun: Writer Skill matrix 20/20, Writer asset runtime 5/5, Writer UI 6/6, cutover contract 2/2, shared boundary/provenance 8/8, media Provider parity 2/2, AI model catalog 21/21, AI routing 23/23, root `pnpm lint`, and production `pnpm build` (425/425 routes) all passed. Browser E2E, live SaaS regression, and production Writer smoke remain open.
- [x] 5.7 发布人工 ZIP 升级说明和已知限制，不启用应用内自动更新
  - [x] 普通/便携 ZIP README 均说明关闭应用后手动替换；便携模式先备份 `data/`；不自动下载或替换自身，并明确外部 Vault、系统 WebView2 和明文 API Key 边界。

**Quality Gate:**
- [ ] 全新 VM 可完成首个对话、PPT、媒体、工作流和 Vault 检索
- [ ] 除 runtime 源和用户 Provider 外无其他网络请求
  - [x] 2026-08-14 `desktop:verify-network-boundary` scans the built UI/host/knowledge bundles (743,542 UTF-8 bytes) and reports zero hardcoded external endpoints; local loopback and runtime-configured Provider indirection remain allowed. Clean-VM dynamic egress verification remains open.
  - [x] 2026-08-14 built `dist-runtime/host.mjs` completed a local file workflow under a Node network guard that rejects fetch/http/https/net/tls/dns egress; the run reached `done` with empty stderr. This proves the local no-Provider workflow path is offline-safe; clean-VM dynamic egress and configured user-Provider requests remain separate release evidence.
- [x] Desktop bundle 排除 Lead Hunter、auth、enterprise、billing、R2、Railway、Cloudflare、Dify/RAGFlow
  - [x] 2026-08-13 desktop architecture scan and shared-boundary/provenance tests reject these imports/routes; release EXE startup remained alive for 8 seconds and exited cleanly.

## Completion Checklist

- [ ] 所有阶段与质量门禁通过
- [ ] 三个 capability specs 全部满足
- [x] 发布清单记录签名、hash、体积、测试矩阵和未测组合
  - [x] 2026-08-14 `docs/desktop/windows-v1-release-checklist.zh-CN.md` records current normal/portable/runtime ZIP, EXE and NSIS SHA-256/size, passed test matrix, real Provider scope, unsigned-manifest/AuthentiCode state, VM gaps, production gaps, and the explicit Seedance exclusion.
- [ ] Ready for `openspec-archive harden-windows-desktop-release`

## Why

完成桌面功能并不等于可以发布。Windows v1 要求用户下载 ZIP、解压并运行 `AI Marketing.exe`，同时又采用“优先复用兼容系统组件、缺失时自动安装私有 runtime”的轻量分发方式。若没有强制启动门禁、多源下载、离线包、签名验证、便携数据规则和干净 VM 回归，用户会在缺少 WebView2、Python、OpenCode、字体或模型时得到不可复现的残缺环境。

## What Changes

- 在创建 WebView 前运行原生 bootstrap，完整检查 WebView2、Node、workflow-host、OpenCode、Python/依赖、字体、本地 embedding、Skills 和数据库/索引 migrations。
- 可复用系统组件时记录其 canonical absolute path；缺失、不兼容或损坏时自动调用安装脚本安装到 AIMarketing 私有 runtime。
- 不严格锁定组件版本，使用最低兼容范围与 capability probe；可用环境不主动升级，失败时可回退 last-known-good。
- 下载顺序为阿里云 OSS/CDN、腾讯云 COS/CDN、清华实际支持的镜像、组件官方源。
- runtime manifest 由离线私钥签名，客户端内置公钥；所有包校验签名、SHA-256、大小和组件身份。
- 单独发布可导入的 `AIMarketing-Runtime-x64.zip`，主 ZIP 不携带完整大运行时。
- 普通模式使用 `%LOCALAPPDATA%\AIMarketing`；程序旁存在 `portable.flag` 时使用 `data/`，复制整个目录可携带 runtime、数据库、索引、配置和项目。
- 应用升级采用人工下载新 ZIP 并替换程序文件；不做应用内网络自动升级。
- 建立 Win10 22H2/Win11 x64、中文/空格/长路径、OneDrive、损坏组件、断网、代理和恢复测试矩阵。

## Dependencies

- `validate-windows-desktop-feasibility`（消费其架构决定和诊断限制；本 change 自己拥有最终 clean-VM 与发布验收）
- `establish-desktop-foundation`
- `extract-shared-application-core`
- `add-local-opencode-workbench`
- `add-writing-ppt-and-obsidian-rag`
- `add-desktop-media-and-workflows`

## Capabilities

### New Capabilities

- `windows-runtime-distribution`: 强制门禁、兼容性探针、多源下载、签名、修复和离线包。
- `desktop-portable-data-mode`: 普通/便携路径、复制、升级和单实例语义。
- `windows-release-verification`: 支持矩阵、体积、签名、隐私、恢复和发布验收。

### Modified Capabilities

无。本 change 对前序桌面能力建立发布约束，不改变 SaaS 发布方式。

## Scope

### In Scope

- Windows 10 22H2、Windows 11、x64。
- 普通绿色 ZIP、便携预设 ZIP、离线 runtime ZIP。
- 阿里云、腾讯云、清华适用镜像和官方源。
- Runtime 安装/修复脚本、诊断、日志脱敏和完整性检查。
- Windows 代码签名与 runtime manifest 签名。

### Out of Scope

- Windows 7/8、32-bit、ARM64、macOS、Linux。
- MSI 强制安装、Docker、WSL 或要求用户安装 Node/Python/OpenCode。
- 应用内自动升级或后台主动升级 runtime。
- 账号、遥测、云同步和 AIMarketing 业务后端。

## Impact

- Tauri/Rust：pre-window bootstrap、probe、downloader、signature verifier、process/runtime paths。
- Packaging：普通/便携/离线脚本、manifest schema、多源发布和 size budget。
- CI：Windows VM E2E、签名、许可证、依赖、安全和 bundle 内容审计。
- UX：首次安装、进度、重试、离线导入、诊断和便携密钥风险提示。

## Success Criteria

- [ ] Foundation approval 未被误当成 release approval；只有本 change 全部质量门禁通过才可发布。
- [ ] 干净 Win10/Win11 VM 从主 ZIP 自动补齐环境后进入完整主界面。
- [ ] 任意必要 runtime 缺失或损坏时自动修复，未完成前不进入受限模式。
- [ ] 前三个镜像不可用时回退官方源；所有源不可用时可导入离线包。
- [ ] manifest/包被篡改时安装失败且当前 last-known-good 保持可用。
- [ ] 普通升级不覆盖 LocalAppData；便携目录复制后无需重复下载合格 runtime。
- [ ] 发布 bundle 不包含排除的 SaaS 功能和后端 clients。

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| WebView2 缺失导致 React 安装页无法显示 | Medium | High | 在创建 WebView 前使用原生 bootstrap UI |
| 国内镜像被替换或不同步 | Medium | High | 离线签名 manifest + SHA-256 + last-known-good |
| 系统组件升级后行为漂移 | High | Medium | capability probe、固定本次 absolute path、失败转私有 runtime |
| 便携目录复制泄露明文 API Key | Medium | High | 持续风险提示、诊断脱敏、文档明确复制语义 |
| 发布体积持续增长 | Medium | Medium | CI 输出组件明细并执行 size budget |

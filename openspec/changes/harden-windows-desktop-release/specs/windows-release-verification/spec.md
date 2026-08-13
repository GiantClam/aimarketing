## Purpose

定义 Windows v1 发布前必须通过的平台、完整性、恢复、隐私、体积和回归门禁。

## ADDED Requirements

### Requirement: Supported Windows targets are explicit

Windows v1 SHALL 支持 Windows 10 22H2 和 Windows 11 x64，并明确不支持 Windows 7/8、32-bit 和 ARM64。

#### Scenario: Build release artifacts
- **GIVEN** 发布流水线运行
- **WHEN** 生成 Windows 包
- **THEN** 只生成并标记 x64 Win10 22H2/Win11 支持产物

### Requirement: Clean-machine end-to-end verification is mandatory

发布候选 SHALL 在干净 Win10/Win11 VM 完成从 ZIP 到环境安装、模型配置、普通对话、PPT、媒体、工作流和 Vault 检索的完整路径。

#### Scenario: Verify a release candidate
- **GIVEN** 一台无开发环境的干净 VM
- **WHEN** 测试人员运行主 ZIP
- **THEN** 用户无需预装 Node、Python、OpenCode、WSL、Docker 或数据库服务即可完成核心路径

### Requirement: Recovery and path variants are release gates

发布 SHALL 覆盖中文用户名、空格、长路径、OneDrive、组件损坏、进程强杀、断网、代理和离线导入。

#### Scenario: Kill child processes during a run
- **GIVEN** OpenCode 或 workflow-host 正在执行
- **WHEN** 测试强制终止进程或主应用
- **THEN** Windows Job Object 清理子进程，重启后 run 状态和恢复策略正确

### Requirement: Distribution integrity is verifiable

主程序 SHALL 使用 Authenticode 签名，runtime manifest SHALL 使用独立离线密钥签名，发布页 SHALL 提供包 hash。签名或 hash 失败 MUST 阻止安装/运行被篡改组件。

#### Scenario: Verify signed release
- **GIVEN** 官方发布候选
- **WHEN** CI 和用户诊断执行完整性检查
- **THEN** EXE、ZIP、manifest 和 runtime components 均可验证来源和内容

### Requirement: Size budgets report component ownership

CI SHALL 分别记录主 ZIP、解压程序和首次补齐 runtime 的体积，并按 WebView2、Node、OpenCode、Python、字体、embedding、Skills 和应用代码输出明细。超预算 MUST 失败而不是静默增长。

#### Scenario: A dependency increases bundle size
- **GIVEN** 某组件更新后超过已配置预算
- **WHEN** packaging CI 运行
- **THEN** CI 报告该组件增量并阻止发布

### Requirement: Excluded SaaS capabilities are absent

Desktop bundle MUST NOT 包含或注册 Lead Hunter、公开营销页面、身份/企业/计费、发布为 Agent、工作流市场、企业预设、R2、Railway、Cloudflare、Dify 或 RAGFlow 客户端。

#### Scenario: Audit the final bundle
- **GIVEN** release candidate 已构建
- **WHEN** 执行静态 bundle/route/dependency 检查
- **THEN** 排除能力均不存在且无对应网络路径

### Requirement: Manual ZIP upgrades preserve data

Windows v1 SHALL 使用用户主动下载和替换 ZIP 的升级方式，不实现应用内网络自动更新。普通模式数据不得被覆盖；便携模式升级 SHALL 先提示备份 `data/`。

#### Scenario: User checks for an application update
- **GIVEN** 应用运行正常
- **WHEN** 用户打开版本信息
- **THEN** 应用可展示当前版本和手动升级说明，但不后台下载或替换应用


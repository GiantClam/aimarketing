## 1. Complete runtime probes and pre-window bootstrap

- [ ] 1.1 为 WebView2、Node/workflow-host、OpenCode、Python/PPT、字体、embedding、Skills 和 migrations 建 probe tests
- [ ] 1.2 在 Tauri WebView 创建前执行原生 bootstrap 状态机
- [ ] 1.3 复用通过 probe 的系统组件并记录 canonical absolute path
- [ ] 1.4 对缺失/损坏组件自动调用 UTF-8 安装脚本
- [ ] 1.5 安装结束后完整重复 probe，任一失败则阻止主界面

**Quality Gate:**
- [ ] 缺 WebView2 时仍能显示修复进度
- [ ] 不存在受限主界面或跳过必要 runtime 的路径
- [ ] 系统 PATH 在本次启动中变化不会改变已选 executable

## 2. Signed multi-source distribution

- [ ] 2.1 定义 component/source/compatibility/hash/size/signature manifest schema
- [ ] 2.2 实现阿里云 → 腾讯云 → 清华适用源 → 官方源路由
- [ ] 2.3 实现断点续传、代理、磁盘检查、临时目录和原子安装
- [ ] 2.4 使用离线私钥签署 manifest，客户端内置公钥验证
- [ ] 2.5 实现 last-known-good 回退和“可用不主动升级”策略
- [ ] 2.6 对每个 runtime 组件完成再分发许可审计

**Quality Gate:**
- [ ] 损坏签名、hash、size 或组件身份均 fail closed
- [ ] 镜像回退测试覆盖每一级来源
- [ ] API Key、签名私钥不进入发布包或日志

## 3. Offline runtime bundle

- [ ] 3.1 生成 `AIMarketing-Runtime-x64.zip` 和同一签名 manifest
- [ ] 3.2 实现本地选择、验证、断点/重复安装和回滚
- [ ] 3.3 验证全部在线源不可用时可完成首次环境安装
- [ ] 3.4 验证离线包不覆盖较新的兼容用户数据或配置

**Quality Gate:**
- [ ] 干净离线 VM 可通过本地包完成门禁
- [ ] 被篡改离线包不会修改当前 runtime
- [ ] 主程序 ZIP 不重复内置完整 runtime

## 4. Normal and portable packages

- [ ] 4.1 生成普通 ZIP，数据/runtime 默认位于 `%LOCALAPPDATA%\AIMarketing`
- [ ] 4.2 生成含 `portable.flag` 的便携 ZIP，全部应用数据位于程序旁 `data/`
- [ ] 4.3 实现普通/便携单实例锁和数据库/索引占用提示
- [ ] 4.4 验证便携目录复制到另一台兼容电脑后只重新 probe，不重复下载合格 runtime
- [ ] 4.5 明示外部 Obsidian Vault、系统 WebView2 不随便携目录复制
- [ ] 4.6 明示便携复制同时复制明文 API Key

**Quality Gate:**
- [ ] 两种模式路径、升级、备份和复制 E2E 通过
- [ ] 第二实例无法并发写同一 SQLite/LanceDB
- [ ] 普通升级不覆盖 LocalAppData

## 5. Release hardening and verification

- [ ] 5.1 在 Win10 22H2/Win11 x64 运行中文用户名、空格、长路径和 OneDrive 测试
- [ ] 5.2 运行 OpenCode/workflow-host 强杀、恢复和 Windows Job Object 测试
- [ ] 5.3 执行日志 30 天/1GB 清理和诊断包脱敏测试
- [ ] 5.4 执行主 ZIP、解压后、runtime 补齐后的组件级 size budget
- [ ] 5.5 执行 Authenticode、manifest 签名、依赖漏洞和许可证审计
- [ ] 5.6 执行 desktop 全量 E2E 与 SaaS lint/build/regression
- [ ] 5.7 发布人工 ZIP 升级说明和已知限制，不启用应用内自动更新

**Quality Gate:**
- [ ] 全新 VM 可完成首个对话、PPT、媒体、工作流和 Vault 检索
- [ ] 除 runtime 源和用户 Provider 外无其他网络请求
- [ ] Desktop bundle 排除 Lead Hunter、auth、enterprise、billing、R2、Railway、Cloudflare、Dify/RAGFlow

## Completion Checklist

- [ ] 所有阶段与质量门禁通过
- [ ] 三个 capability specs 全部满足
- [ ] 发布清单记录签名、hash、体积、测试矩阵和未测组合
- [ ] Ready for `openspec-archive harden-windows-desktop-release`


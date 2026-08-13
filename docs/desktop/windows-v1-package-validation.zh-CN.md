# Windows 绿色版当前构建验证

日期：2026-08-13  
分支：`windows-ver`

## 已验证产物

| 产物 | 结果 |
| --- | --- |
| NSIS | `apps/desktop/src-tauri/target/release/bundle/nsis/AI Marketing_0.1.0_x64-setup.exe`（直接 bundle 验证通过） |
| 普通 ZIP | `.artifacts/desktop-release/AI-Marketing-Windows-x64-normal.zip`，268,933,332 bytes，SHA-256 `8A7295AC95744332724B0B040DA8005AE87C67416C3734C85668DA62DDEF0A25` |
| 便携 ZIP | `.artifacts/desktop-release-new/AI-Marketing-Windows-x64-portable.zip`，268,996,894 bytes，SHA-256 `D78706117EC9CDC498BAB72B892839CBC45B2635553CC9E6B06EFAA56A5A0D75` |

本轮 Tauri release exe（12,396,544 bytes）SHA-256：`C38F8DF05437036DCC646E24358DC4DB1B9EACB74D35D6E6522E0035B407515A`。
上一轮直接 bundle 生成的 NSIS 安装包（179,619,046 bytes）SHA-256：`EBCE6C3DD571D5EB944AC64A80F4B5EE5642291BE56C4D58360E78BE7DD8963E`；本轮 UI 修复未能在本机 `makensis` 上重新生成安装器；已用 `tauri build --no-bundle` 重新生成 release exe 并重新打包普通 ZIP。

普通 ZIP 不携带 `portable.flag`，使用 `%LOCALAPPDATA%\\AIMarketing`；便携 ZIP 携带 `portable.flag`，使用 exe 旁 `data/`。两种 ZIP 均包含 `_up_/dist-runtime/host.mjs`、完整 `ppt-master` Skill、Windows LanceDB native binding 和修复脚本；本轮 ZIP 已重新从新 release exe 生成。NSIS 安装器仍保留上一轮直接 bundle 的证据，本轮重建在 `makensis` deflate 阶段长时间无产物，已停止该工具进程，不将其误报为本轮通过。

## UI 一致性回归

- 首页、普通对话、工作流和视频 Agent 均使用 `@aimarketing/workbench-ui` 的共享壳、路由清单、消息几何和主题变量。
- 视觉烟测确认桌面端不会因外层 flex 容器把聊天/工作流压缩为窄栏；视频 Agent 入口与线上一致放在侧栏底部。
- 普通对话和首页输入区均提供线上同位置的模型、推理强度选择；对话用户消息右对齐为深色气泡，AI 消息左对齐为带头像的结果卡片。
- 持久 OpenCode 会话现在按本轮 assistant 基线完成判定，上一轮已完成消息不会被误当成当前轮结果；普通对话、Writer、PPT 的多轮交互因此保持连续。
- AI 消息复用线上产物卡片，直接打开本地文件；设置页保留线上布局并增加离线运行时 ZIP 导入入口。
- 聊天消息现由 `@aimarketing/workbench-ui` 的 `WorkbenchChatMessage` 输出与云端 AI Entry 同构的 `message-card-user`、`assistant-message`、头像、时间和处理事件面板；聊天落地页保留云端快捷提示词按钮，首页使用云端嵌入式聊天框布局。
- 本轮进一步补齐云端交互：AI Composer 使用同一组快捷提示词，消息保留附件芯片；Writer 回复提供预览、生成图片、复制富文本、复制 Markdown 四个线上同位置动作，图片动作会重新进入本地媒体运行链。
- 消息正文现在由共享 Workbench UI 使用同一套 GFM Markdown 渲染，标题、列表、链接和代码块在桌面/云端保持相同语义，不再把 OpenCode 回复降级成纯文本。
- 首页发送按钮现在复用云端 `send-button` 视觉契约（斜角、边框、字重与禁用态）；设置路由仍可深链访问，但从桌面主侧栏隐藏，和云端账户/状态入口的导航密度保持一致。
- 首页入口组与云端保持五列布局、相同分组顺序、文案和路由；桌面端仅按已确认范围排除 Agent Market、企业平台设置、Lead Hunter、公开页面和计费入口。
- 首页入口卡与侧栏路由图标统一由 `@aimarketing/workbench-ui` 的 `WorkbenchRouteIcon` 输出，云端与桌面不再各自维护一套 SVG/图标路径。
- 云端静态侧栏入口（首页、能力中心、工作流、任务、资产、知识库和设置）也通过同一共享图标渲染器输出；动态企业入口仍保留云端自身的权限/可见性逻辑。
- 首页现直接复用云端的 `home-shell → home-page-shell → home-topbar/home-main` DOM 层级，并在桌面样式中复制同一页面宽度、padding、背景和滚动边界，避免壳层额外 padding 造成视觉漂移。
- 普通对话与 Writer 深链接会从 SQLite 回放整段 user/assistant 消息历史，不再只显示最新一轮；流式回复完成后追加到同一消息时间线。
- 输入区补齐云端同位置的本地附件添加/移除；Tauri 桌面会把附件以分块流式方式写入项目目录 `attachments/`，完成后将相对路径注入本轮 OpenCode 上下文，浏览器预览模式才降级为仅元数据提示。
- Writer 输入区与云端保持 Ctrl/Cmd+Enter 发送、Shift+Enter 换行、附件/Obsidian 菜单、平台/内容/模式/语言选择和回复动作；Writer 选项会随同一条 OpenCode prompt 提交，而不是只停留在 UI 状态。
- Writer 预览现在支持线上同类的“编辑内容”交互；提交编辑会把 Markdown 原子写入项目 `articles/`、登记为本地产物，并把已编辑草稿带入下一次 OpenCode 写作 turn。
- 工作流、媒体与资源中心复用同一 locale 偏好：默认跟随 Windows/WebView 语言（中文为中文，其余为英文），可在设置中手动覆盖；能力目录、工作流节点和资源统计会随偏好切换。
- 桌面壳支持中英双语：默认读取 Windows/WebView 系统语言，中文系统使用中文，其它系统语言使用 English；设置页可选择跟随系统、中文或 English，偏好写入本地 `config.json`。
- 侧栏语言控件现在与云端 `LocaleSwitcher` 保持同一双按钮交互（中文/EN、当前语言高亮、紧凑态垂直排列），不再用单按钮循环切换，避免桌面与云端操作路径分叉。
- 查询参数 Agent 路由现在与云端一样只高亮精确 Agent 项，不会同时激活 `/dashboard/ai` 基础入口；Composer 的按钮尺寸、圆角、顶部黄色强调线和消息 Markdown 段落/列表/代码块间距也与云端样式契约一致。
- AI 对话在非落地空会话状态下也会把云端快捷提示词放回 Composer；落地页补齐 `AI WORKSPACE` 信号条、标题层级和 `dashboard-panel` 快捷卡语义，避免从历史会话返回时出现交互分叉。
- 普通对话和首页输入区同时提供 Skill 选择（自动、内容写作、营销分析、ppt-master、Obsidian RAG）；选定 Skill 作为 OpenCode 本轮上下文，不改变本地会话原文。
- 默认 `local + ollama/qwen3:8b` 会按模型前缀写入 OpenCode 的 `ollama` provider，避免首启后本地模型被错误归入 `local`。
- 能力中心保留线上 `/dashboard/capabilities` 路由与同构能力目录；视频 Agent `/dashboard/video` 单独提供音频/视频分组卡、能力 tile 和 launcher 多标签。卡片点击后进入对应本地工作区，不引入企业预设或发布市场。
- 任务中心保留线上任务路由，读取 SQLite `runs`，展示 succeeded/failed/interrupted/cancelled 状态，并可把最近一次用户指令载入普通对话以显式准备重试。
- 工作流页面支持 JSON 导出/导入；导入经过 `workflow-core` schema migration，重新生成本地 workflow ID，不复制原机 Provider、路径或数据库 ID。
- 长媒体任务在启动时读取本地 `run_attempts`，若已有 provider task ID 则通过 `media.resume` 继续 poll/download，不重新 submit；API Key 只从当前 config.json 注入运行时。
- 媒体任务现在在提交、成功、失败、取消和下载失败时写入终态 attempt 事件；设置页支持自定义媒体提交/查询 Endpoint，RunningHub 等异步 Provider 可在重启恢复时继续使用同一配置而不会重复提交。
- 媒体工作台按线上能力分组提供音频处理/视频处理多标签、能力说明、动态字段、URL/本地产物选择器、提交状态和产物打开；字段 schema 位于共享 `@aimarketing/workbench-ui`，避免桌面端复制另一套能力清单。
- 本轮进一步把媒体/视频工作区外壳对齐线上能力页：网格背景、`capabilities-header` 标题层级、能力分组卡、16px 配置/结果面板、双栏比例、黄色折角和圆角表单控件；本地 Provider 与 OpenCode 事件链保持不变。
- 本轮修复 Writer 预览的布局漂移：桌面改为与云端相同的右侧 920px 抽屉、全高滚动和左侧遮罩；工作流能力列表、编辑器下拉框和画布节点在英文界面统一使用云端对应文案。
- 视频 Agent 现在复用线上能力页的能力分组、能力卡片和 launcher tab 交互；点击能力卡/Tab 会切换本地运行能力，并继续进入原有 OpenCode/媒体任务链。
- 资产库现在使用线上同构的资产标签栏、搜索框、网格/列表视图切换和本地文件卡片；打开、不可用记录移除仍走 Tauri 本地文件端口。
- 任务中心现在使用线上同构的指标卡、搜索/状态筛选和聚合任务表；查看会话与失败/中断重试仍绑定本地 SQLite/OpenCode 运行记录。
- 图片助手补齐线上常用的提示词、质量、尺寸、数量和参考素材字段；配置作为本地媒体请求输入传给 OpenCode workflow，不经过 UI base64。
- 媒体配置状态现在按 Provider source 判定；默认 `local` 文本模型仍提示需要媒体 Provider，但填写 OpenAI-compatible Base URL 后即使保留默认 `local` id 也会正确进入可运行状态。
- `/dashboard/image-assistant` 现在直接进入图片助手工作区，不再落入通用 library/fallback 页面；其提示词、质量、尺寸、数量和参考素材配置与云端入口保持同一交互路径。
- 两个线上 PPT 查询入口（`/dashboard/ai?agent=executive-ppt`、`/dashboard/ai?agent=executive-presentation-ppt`）现在与云端一样进入 AI 对话消息壳；桌面端只在运行时将前者/后者映射为 `ppt-master` OpenCode 指令，不再误显示为媒体工作台。
- 保留线上 `/dashboard/works` 兼容深链接，按云端行为立即 canonicalize 到 `/dashboard/assets`，避免作品库与资产库出现第二套交互。
- 资产库与媒体产物列表点击文件默认调用 Windows 关联程序打开，符合线上“打开/交付”交互；Obsidian 引用仍可通过独立的 Tauri 命令在 Explorer 中定位原文。
- Desktop App 的会话、消息、文件打开和运行取消通过 `@aimarketing/workbench-client` 的 Tauri adapter 进入统一端口，避免 UI 直接依赖一套平行业务协议。
- Runtime probe 现在同时校验 SQLite migrations 与 `ppt-master` 完整 Python requirements（PPTX、SVG、PDF、文档、表格、图片、网页和音频工具链）；缺失时设置页/窗口前安装器会沿同一镜像链补齐，设置页可提供离线 runtime ZIP，安装后重启复检。
- 本轮将窗口前门禁、Tauri `runtime_probe` 和 workflow-host 的 Python 选择统一到同一完整依赖探针，避免只安装 `pptx` 的不完整系统 Python 被误选；英文界面同步补齐知识库引用、工作流节点标题/保存名称和未知成本文案。
- Tauri 创建窗口前增加 Windows WebView2 原生预检：检测注册表/安装目录，缺失时自动下载官方 bootstrapper、静默安装并复检；仍失败则阻止进入半可用 UI，并显示原生错误提示。
- 工作流画布的 Input、Capability、Output 节点可选中并拖拽；画布支持平移、缩放、适配视图、网格背景和连线可视化，选中后显示与执行前配置对应的任务输入、Skill/能力选择和输出策略面板，运行仍统一进入 OpenCode 本地 Agent。
- 知识库页面已接入本地 `knowledge.search` RPC，结果显示 Vault 相对路径/行号并通过受 Vault 根目录约束的命令打开原文；普通对话不会自动注入 Vault 内容。
- Obsidian 扫描与 watcher 现在统一跳过 `.obsidian`、`.trash`、任意嵌套隐藏目录、符号链接和 Vault 根目录 `.gitignore` 命中的路径，避免隐藏/临时/用户忽略内容进入 manifest 或语义索引。
- 首页截图：`.omx/state/ui-parity/desktop-home.png`；聊天、工作流和媒体截图位于同目录，作为本次本地回归证据。

## 启动冒烟

- 从便携 ZIP 解压后确认 `portable.flag`、主 exe、host 资源和安装脚本均存在。
- 从便携 ZIP 临时解压目录启动验证：`portable_flag=true`、`data_root_created=true`、`startup_alive=true`，本轮 PID 29060；内置 Node、OpenCode、LanceDB、字体和 embedding 描述文件均随包存在，进程保持存活 10 秒后显式停止。当前开发机仍会因缺少完整 Python PPT 依赖停留在窗口前安装器，未将其误报为端到端 PPT 通过。
- 从普通 ZIP 清单确认 `runtime/lancedb/node_modules/@lancedb/lancedb/dist/index.js`、`lancedb-win32-x64-msvc.node` 和离线 `runtime/embedding/local-hash-384-v1.json` 均存在，并以 staged runtime 完成真实写入/近邻查询。
- 新 release 主 exe 启动 8 秒保持存活（`startup_alive=true`，本轮 PID 41092，随后显式停止），并通过窗口前的运行时门禁完成资源探针；停止后无残留桌面主进程。

## 回归命令

- `pnpm --filter @aimarketing/desktop typecheck`
- `pnpm --filter @aimarketing/desktop test`：54/54 通过（含首页云端 `home-shell → home-page-shell` 骨架、跨端共享图标渲染、SaaS-only 入口排除、能力中心目录/视频分组卡、launcher tab、设置深链单一面板、Obsidian `.gitignore`/隐藏路径过滤、资产库筛选/视图切换、任务中心聚合表、媒体终态 attempt、Provider source 配置状态、workflow host 崩溃重启、云端消息外层和侧栏几何契约、OpenCode 多轮 assistant 基线，以及本地 Skill 配置持久化）
- `pnpm --filter @aimarketing/workflow-core test`：12/12 通过（含 DAG 并行、节点失败事件、foreach 汇总）
- `pnpm --filter @aimarketing/media-runtime test`：13/13 通过（含提交后取消、持久任务续 poll、流式下载原子落盘、媒体大小/MIME 校验）
- `pnpm --filter @aimarketing/desktop exec cargo test --manifest-path src-tauri/Cargo.toml`：10/10 通过（含实例锁、窗口前运行时门禁与 WebView2 bootstrap 预检辅助测试）
- `pnpm exec openspec validate --all --strict`：8/8 通过
- `pnpm lint`、`pnpm build`：通过

## 当前限制

证据来自非干净 Windows 11 开发机；未代替 Win10 22H2/干净 Win11、缺失 WebView2、真实 Provider、真实 OpenCode+ppt-master 端到端产物和 Authenticode 签名验收。工作流画布已补齐桌面侧的拖拽、平移、缩放、适配和连线可视化，但仍需在干净系统上做逐像素视觉回归，不能宣称与线上每个像素完全相同；本地文本模型依赖用户已有/配置的 loopback 服务，绿色包不携带大模型权重。LanceDB Windows native binding 使压缩包约 269 MB，属于本地语义 RAG 的固定运行时成本。MSI 不作为首版绿色发布目标，避免可选 WiX 工具阻断 NSIS/ZIP 发布。

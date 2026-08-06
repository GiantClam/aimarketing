## Why

Writer Assistant 当前由应用层状态、正则意图判断、截断历史和 OpenCode Skill 共同控制写作流程，造成多轮修改时完整文章上下文丢失，并使平台 Skill 难以独立替换。现在需要建立一条由持久化 OpenCode 会话和平台主 Skill 驱动、由应用层治理和持久化的唯一生产路径，以提高文章质量、修改一致性和多平台扩展能力。

## What Changes

- **BREAKING**：删除旧 Writer 双阶段 brief extraction、应用层新写/修改/翻译/URL 意图判断及备用生成路径；每个 Writer text turn 只执行一次 OpenCode + Skill 流程。
- 为每个 Writer conversation 派生稳定 OpenCode `sessionKey`，同时始终以数据库中的完整 active draft 和 revision 作为可恢复事实源。
- 将任务状态、turn outcome、文章 revision 和图片状态拆分，pending 请求不得清空或排除当前文章。
- 引入 schema v2 Writer Skill Registry；runtime 每轮只能激活一个平台主 Skill，并可加载与该主 Skill 兼容的可选 style Skill。
- 将微信公众号唯一主 Skill 设置为 `khazix-writer`，不再叠加 `writer-wechat`。
- 支持 WeChat、小红书、微博、抖音、X、LinkedIn、Instagram、TikTok、Facebook 和 Reddit 平台绑定；平台 Skill 可通过 registry 原子替换而无需修改 Writer API、任务、数据库和 UI 主流程。
- 引入受治理的 `writer_submit_result` 结构化结果契约，统一追问、新写、修改、翻译、缩写、扩写、跨平台改编、调研和图片意图。
- URL 是否需要调研由 OpenCode + Skill 决定，实际访问通过带 SSRF、大小、重定向和超时限制的 `writer_webfetch` 完成。
- Skill 返回封面和正文配图意图，应用层负责图片生成、存储、计费和恢复；每张图片单独超时，多图任务允许累计耗时和部分成功。
- 将 `content/skills/` 设为 Writer Skill 唯一源，通过同步和校验生成 runtime bundle、catalog 和 digest。

## Capabilities

### New Capabilities

- `writer-session-runtime`: Writer conversation 与持久化 OpenCode session 的映射、完整上下文注入、恢复和结构化 turn 执行契约。
- `writer-platform-skill-contract`: 可替换平台主 Skill registry、唯一激活规则、Khazix 公众号绑定和 Skill 发布一致性。
- `writer-document-revisions`: active draft、文章 revision、并发冲突和 UI 编辑语义。
- `writer-research-assets`: OpenCode 内 URL/企业知识调研，以及封面和正文配图的受治理生成、逐张超时与恢复。

### Modified Capabilities

无。仓库当前没有已建立的 OpenSpec capability；本 change 创建 Writer Assistant 的首批行为规范。

## Impact

- API/任务：`app/api/writer/chat/route.ts`、`app/api/writer/messages/route.ts`、`app/api/writer/assets/route.ts`、`lib/assistant-async.ts`。
- Writer 领域：`lib/writer/skills.ts`、repository/types/session-store/assets runtime，以及新增 runtime/service/registry 模块。
- Runtime：`lib/ai-runtime/contracts.ts`、`lib/ai-runtime/opencode-prompt.ts`、共享 Railway OpenCode runner、Writer runtime tools。
- Skills：`content/skills/writer-catalog.json`、`writer-orchestrator`、`khazix-writer` 和所有平台 Skill；runtime 副本改为生成产物。
- 数据：Writer conversation state、active draft revision、context hash、Skill release/digest 和 diagnostics 需要持久化迁移。
- UI：Writer workspace 在任务运行期间保留当前文章，并展示 revision、turn outcome 和独立图片状态。
- 验证：新增 Skill contract、session recovery、完整文章修改、跨平台适配、URL 调研、图片恢复和全平台质量/E2E 测试。
- 配置：继续复用共享 OpenCode runtime URL/provider，不新增 Writer 或平台专属环境变量，也不新增第三方依赖。

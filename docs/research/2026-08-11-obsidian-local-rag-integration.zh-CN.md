# Obsidian Vault 本地知识库接入研究

**日期：** 2026-08-11  
**适用范围：** AIMarketing Windows 绿色版（Tauri）  
**结论状态：** 建议采用，可进入桌面版技术方案

## 结论

AIMarketing 首版应采用成熟的 **“直接读取 Vault 文件 + 应用外置本地索引”** 方案：

1. 首次运行由用户通过目录选择器显式选择 Vault，不解析 Obsidian 私有全局配置来“自动发现”。
2. Tauri/Rust 后端直接读取 Vault 中的 Markdown 和受支持附件；Obsidian 不需要安装插件，也不需要保持运行。
3. `%LOCALAPPDATA%\AIMarketing\app.db` 只存业务数据和 Vault 映射；每个 Vault 的 RAG 索引单独放在 `indexes/<vault-id>/`，推荐采用嵌入式 LanceDB。
4. 文件系统监听只用于降低延迟；启动/恢复时的清单校验才是正确性保障。索引是可删除、可重建的派生缓存，Vault 文件始终是事实源。
5. 默认只向 Vault 内的 `AI Marketing/` 创建新文件。修改既有笔记必须显式选择、预览差异并做并发校验。
6. Local REST API、Obsidian CLI 或自研 companion plugin 都不是首版必需依赖；可在后续作为“Obsidian 正在运行时的增强写回通道”。

这个方向符合 Obsidian 自身的数据模型：官方明确说明 Vault 就是本地文件夹，笔记是 Markdown 纯文本，其他编辑器和文件管理器可以直接管理，Obsidian 会自动刷新外部修改。[Obsidian：How Obsidian stores data](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata)

## 社区成熟方案比较

| 方案 | 代表实践 | 优点 | 代价 | 对 AIMarketing 的判断 |
| --- | --- | --- | --- | --- |
| Obsidian 插件内索引 | Smart Connections、Copilot for Obsidian | 可直接使用 Obsidian Vault/MetadataCache 事件与 API | 索引占用 Obsidian/Electron 内存；功能必须随 Obsidian 运行 | 可借鉴增量索引和排除规则，不作为桌面产品运行架构 |
| Obsidian 插件向独立服务同步 | Khoj | 搜索服务与 Obsidian UI 解耦，可自托管 | 要求用户安装插件；存在同步协议和重复状态 | 不适合作为零依赖首版默认路径 |
| 本地 REST/MCP 桥 | Local REST API plugin | 具备 CRUD、搜索、精确段落/frontmatter patch、乐观并发 | 要安装插件、保存 bearer token、处理自签证书，且 Obsidian必须运行 | 仅作为高级可选集成 |
| 外部程序直接读 Vault | Obsidian 官方支持的纯文件模型 | 零插件、Obsidian 可关闭、最符合绿色版定位 | 应用自己负责解析、监听、冲突检测 | **首版推荐** |
| 桌面应用自带业务库与嵌入式向量库 | AnythingLLM 的 SQLite + LanceDB | 无数据库服务、数据与升级解耦、适合本地桌面 | 需管理派生索引生命周期 | **索引存储推荐** |

Smart Connections 会监听 Obsidian 事件保持索引同步，并把本地索引视为可重新生成的数据；它还明确建议第三方同步工具忽略 `.smart-env/`，说明“派生索引不要参与 Vault 同步”已是成熟实践。[Smart Connections 官方仓库](https://github.com/brianpetro/obsidian-smart-connections)

Copilot for Obsidian 曾采用 Orama 和 Vault 内 JSON 索引，提供增量索引、分区、包含/排除过滤和强制重建；其维护者后来指出，在 Electron/browser 环境里放大型向量库存在限制，大 Vault 更适合独立本地向量库。[Copilot 发布记录](https://github.com/logancyang/obsidian-copilot/blob/master/RELEASES.md)；[维护者关于大型 Vault 的结论](https://github.com/logancyang/obsidian-copilot/discussions/1948)

Khoj 的 Obsidian 插件会定期把 Vault 同步到 Khoj 服务，也可手动 Force Sync；这证明“插件推送到独立本地服务”可行，但同时引入了插件安装和同步状态，不符合 AIMarketing 的开箱即用边界。[Khoj Obsidian 官方文档](https://docs.khoj.dev/clients/obsidian/)

AnythingLLM 默认同时使用 SQLite 保存常规应用数据、LanceDB 保存向量，维护者给出的理由正是两者都基于文件、无需服务、适合桌面应用。[AnythingLLM 官方仓库](https://github.com/Mintplex-Labs/anything-llm)；[维护者对桌面存储选型的说明](https://github.com/Mintplex-Labs/anything-llm/issues/2057#issuecomment-2273356460)

## 推荐架构

```text
用户选中的 Obsidian Vault（事实源）
  ├─ *.md / *.canvas / PDF / 图片 / 音视频
  ├─ .obsidian/                 默认不读、不写、不索引
  └─ AI Marketing/             默认唯一自动写入区
          │
          ▼
Tauri Rust Vault Adapter
  ├─ 路径规范化与范围校验
  ├─ Markdown/frontmatter/link/embed 解析
  ├─ 文件监听 + 启动/定时清单核对
  ├─ 附件文本抽取
  └─ 安全写回与冲突文件
          │
          ▼
%LOCALAPPDATA%\AIMarketing\
  ├─ app.db                     设置、会话、任务、用量、vault_mappings
  └─ indexes\<vault-id>\
       ├─ lancedb\             chunks、metadata、vectors、FTS
       └─ index-state.json      schema/model/chunker 版本与构建状态
```

LanceDB 官方将开源版本定义为类似 SQLite 的进程内嵌入式数据库，可直接连接本地目录，并提供 Rust SDK、向量检索、全文检索和过滤；它不要求独立数据库进程。[LanceDB Quickstart](https://docs.lancedb.com/quickstart)；[LanceDB 官方仓库](https://github.com/lancedb/lancedb)

### 为什么不把向量写进 `app.db`

把业务库和 RAG 派生索引分开可以做到：

- 卸载/升级/重建索引不影响会话、任务和用量记录。
- 单个 Vault 损坏时只重建自己的索引。
- 用户可独立查看、清理和限制每个 Vault 的索引占用。
- 不把不可同步的向量文件放进 Vault，避免 OneDrive、Obsidian Sync 或 Git 同步大量高频变化的索引。

以 `float32` 为例，单个 1536 维向量原始大小为 `1536 × 4 = 6144` 字节；10 万个 chunk 仅向量即约 586 MiB，尚未包含文本、倒排索引和存储开销。因此“大的是可重建的 `indexes/<vault-id>/`，不是主业务 SQLite”应成为明确产品约束。首版可以把 10 万 chunk 作为受支持上限，但这不是 SQLite 的技术上限。

## Vault 选择与身份

- 使用原生目录选择器，要求用户明确授权目录。
- `.obsidian/` 可作为“这是已被 Obsidian 打开的 Vault”的强提示，但不能成为硬性条件；官方允许把任意现有文件夹打开为 Vault。[Obsidian：Manage vaults](https://obsidian.md/help/Files%2Band%2Bfolders/Manage%2Bvaults)
- 不读取 `%APPDATA%\Obsidian\` 中未公开承诺的 Vault 注册文件。官方只承诺该目录是全局设置目录，没有把其中私有 JSON 定义为外部发现 API。[Obsidian：How Obsidian stores data](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata)
- `vault-id` 不直接等于路径哈希。保存规范路径、卷标识、根目录指纹和用户可读名称；Vault 移动后提供“重新定位”，复用原映射并校验指纹。
- 默认不跟随 junction、symlink 或 reparse point 越出 Vault 根目录，防止索引/写入逃逸。

## 解析与索引范围

### Markdown 与 frontmatter

- Markdown 正文按标题路径和自然块切分，保留 `vault-relative path`、标题层级、行范围和内容哈希。
- YAML frontmatter 解析为结构化 metadata；Obsidian 官方说明 Properties 存储在文件顶部 YAML 中。[Obsidian：Properties](https://obsidian.md/help/Editing%2Band%2Bformatting/Properties)
- 识别 `[[wikilink]]`、`![[embed]]`、Markdown 链接、标签和 block id，用于引用解析、混合检索加权和答案溯源。
- frontmatter 未知键、顺序与原始格式应尽量保留；写回时避免为了更新一个键而格式化整篇笔记。

### 附件

Obsidian 官方支持 Markdown、Canvas、常见图片、音频、视频和 PDF，并允许将这些文件嵌入笔记。[Obsidian：Accepted file formats](https://obsidian.md/help/Files%2Band%2Bfolders/Accepted%2Bfile%2Bformats)

首版建议：

- `.md`：全文索引。
- `.pdf`：本地抽取文本后索引；抽取失败只索引文件名、路径和引用关系。
- `.canvas`：解析 JSON Canvas 中的文本节点和文件引用，保留 canvas 节点来源。
- 图片：默认只索引文件名、路径、alt text 和引用上下文；启用视觉模型后才生成描述，并明确提示这会调用模型 Provider。
- 音频/视频：默认只索引文件名、路径及 Markdown 引用上下文；转写必须是用户显式启用的模型任务。
- 二进制原件永远不复制进数据库或索引目录。

## 增量更新与重建

1. 初次扫描保存每个源文件的相对路径、大小、mtime、内容哈希和解析器版本。
2. 文件监听事件做 0.5–1.5 秒 debounce，并合并编辑器常见的“临时文件 → rename/replace”事件。
3. create/modify 时先重新计算哈希；内容未变则跳过。删除时移除该文档全部 chunk；rename 优先迁移来源路径。
4. chunk ID 由 `文档稳定 ID + 标题路径 + 块内容哈希` 生成，只重新 embedding 发生变化的块。Smart Connections 已采用事件驱动保持索引同步；Copilot 也实现过增量索引和分区。[Smart Connections](https://github.com/brianpetro/obsidian-smart-connections)；[Copilot releases](https://github.com/logancyang/obsidian-copilot/blob/master/RELEASES.md)
5. 文件监听不能作为唯一事实源：应用启动、系统从睡眠恢复、Watcher overflow、Vault 重新挂载后执行完整清单核对。
6. embedding provider/model、维度、chunker 或解析 schema 变化时，构建新的 shadow index；成功后切换，不在原索引上半升级。
7. 设置页提供暂停、继续、清理、重建、当前大小、文件数、chunk 数、失败文件和最后完成时间。

默认排除：

```text
.obsidian/**
.trash/**
.git/**
.smart-env/**
.copilot-index/**
AI Marketing/.tmp/**
隐藏目录、临时文件、锁文件
```

再支持用户 glob、目录选择，以及 frontmatter `aimarketing-index: false`。包含规则不能覆盖安全排除规则。

## 写回安全边界

Obsidian 插件 API 明确建议基于最新内容做原子式 `Vault.process()`，避免 read/modify 间的并发修改造成数据丢失；外部应用虽不能调用该 API，但应实现等价保护。[Obsidian Vault API](https://docs.obsidian.md/Plugins/Vault)

- 自动创建仅允许在用户配置的 `AI Marketing/` 子目录。
- 修改其他既有笔记必须由用户选择目标文件，展示 diff，并逐次确认；Agent 和工作流不能自行扩大写范围。
- 写前记录读取时的内容哈希，落盘前再次校验；不一致时禁止覆盖，改为重新读取/合并或生成 `*.conflict.md`。
- 采用同目录临时文件、flush、原子 replace；保留原换行符、UTF-8 BOM 状态和尾部换行。
- 删除默认进系统回收站或 Vault `.trash/`，不提供无痕删除作为普通 Agent 工具。
- 永不修改 `.obsidian/`、其他插件数据和索引目录。

若后续需要在 Obsidian 正在运行时做精确段落/frontmatter 修改，可优先评估官方 Obsidian CLI；它支持 read/search/create/append 等外部自动化，但要求 Obsidian 1.12.7+ 且应用运行。[Obsidian CLI 官方文档](https://obsidian.md/help/cli)

Local REST API plugin 也提供 HTTPS + bearer token 的 CRUD、heading/block/frontmatter patch、`ifMatch` 乐观并发、搜索和内置 MCP，但要求用户安装插件、Obsidian 运行并处理自签证书。它适合高级用户选配，不适合绿色版首启的硬依赖。[Local REST API 官方仓库](https://github.com/coddingtonbear/obsidian-local-rest-api)

## Windows 与同步盘风险

- **长路径：** Win32 传统 `MAX_PATH` 为 260 字符；解除限制需要操作系统设置与应用 manifest 同时 opt-in，Shell 与文件系统支持也可能不同。桌面壳应声明 `longPathAware`、全程使用 Unicode 路径 API，并在自检中报告仍无法处理的文件。[Microsoft：Maximum Path Length Limitation](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation)
- **OneDrive 占位文件：** Files On-Demand 的 online-only 文件没有完整本地内容，读取可能触发下载或在离线时失败。检测到 OneDrive Vault 时提示用户将 Vault 标记为 “Always keep on this device”。[Microsoft：OneDrive Files On-Demand](https://support.microsoft.com/en-us/office/save-disk-space-with-onedrive-files-on-demand-for-windows-0e6860d3-d9f3-4971-b321-7092438fb38e)
- **同步冲突：** Obsidian 官方说明，同一文件在多个设备同步前被修改会产生冲突，Markdown 可能自动合并并造成重复或格式问题；双重同步也是 Windows 文件消失问题的常见原因。[Obsidian Sync troubleshooting](https://obsidian.md/help/sync/troubleshoot)
- **锁与替换：** Obsidian、编辑器、杀毒软件或同步客户端可能短暂持有文件。写操作需有限次数指数退避；最终失败则保留临时文件并向用户报告，不能静默覆盖。
- **索引位置：** RAG 索引必须放在 `%LOCALAPPDATA%\AIMarketing\indexes`，不得放入 OneDrive Vault。便携模式也应默认放在可执行文件旁的独立 `data/indexes`，不要写进 Vault。

## 明确不推荐

- 不把 `%APPDATA%\Obsidian\` 私有 JSON 当作稳定 Vault discovery API。
- 不要求用户安装 Local REST API、Khoj 或 AIMarketing companion plugin 才能使用知识库。
- 不依赖 Obsidian 必须运行；否则产品无法兑现独立桌面工作台定位。
- 不把 embedding、chunk 缓存或向量库放进 Vault、`.obsidian/plugins/` 或 Obsidian Sync。
- 不把数百 MB 至数 GB 的向量 BLOB 混入 `app.db`。
- 不只依靠文件 watcher；事件可能合并、丢失，休眠和同步恢复后尤其如此。
- 不让 Agent 对整个 Vault 拥有无确认写权限，也不允许通过 symlink/junction 越界。
- 不在 embedding 模型或维度变化后复用旧索引；Copilot 官方 FAQ 也警告切换 embedding 模型会破坏既有结果。[Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot)

## 产品决策建议

确认采用以下口径：

> AIMarketing 通过用户显式选择本地 Obsidian Vault，直接读取 Markdown 与附件并维护应用外的每 Vault LanceDB 派生索引；主 SQLite 不保存 chunk 文本和向量。Obsidian 插件、REST API 和 CLI 均不是首版依赖。默认可索引整个 Vault，但只自动写入 `AI Marketing/`，其他笔记采用显式选择、diff、并发校验后写回。

因此，之前的“每 Vault 一个 `rag-index.db`”建议应调整为 **“每 Vault 一个独立的 LanceDB 索引目录”**。SQLite 体积担忧随之解除：`app.db` 保持小型稳定，RAG 占用独立、可观测、可清理、可重建。

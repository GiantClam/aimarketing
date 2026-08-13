## 1. Reclassify the Feasibility Decision

- [x] 1.1 将 foundation decision 与 release readiness 分开记录。
- [x] 1.2 将 foundation decision 标记为 `approved`，允许开始 `extract-shared-application-core`。
- [x] 1.3 将 release readiness 标记为 `pending`，不得宣称当前版本可发布。
- [x] 1.4 保留现有 spike 的原始状态、证据和限制，不补写不存在的通过结果。

**Quality Gate:**

- [x] `approved` 只解锁共享抽取与 foundation 实施链路。
- [x] `changes-required` 仍可用于描述某个诊断尚未覆盖的环境。
- [x] 结果文档不会把单台开发机证据表述为目标系统矩阵通过。

## 2. Assign Runtime Ownership

- [x] 2.1 将 WebView2 定义为 Tauri React UI 的 Windows 渲染依赖，而非 OpenCode 或 `ppt-master` 依赖。
- [x] 2.2 将 pre-WebView bootstrap 的实现归入 `establish-desktop-foundation`。
- [x] 2.3 将 WebView2 真实缺失、自动安装和干净 VM 验收归入 `harden-windows-desktop-release`。
- [x] 2.4 将 OpenCode session、普通对话、流式事件、工具调用和取消的产品集成归入 `add-local-opencode-workbench`。
- [x] 2.5 将 OpenCode + `ppt-master`、私有 Python、中文 PPTX 和字体/预览回归归入 `add-writing-ppt-and-obsidian-rag`。
- [x] 2.6 将本地 embedding、per-Vault LanceDB、增量索引和检索正确性归入 `add-writing-ppt-and-obsidian-rag`。
- [x] 2.7 将 Win10/Win11 矩阵、签名、最终体积、多源下载安装和恢复归入 `harden-windows-desktop-release`。

**Quality Gate:**

- [x] 每个未完成验证均有唯一的下游 owner。
- [x] 下游 change 不能用本 change 的诊断证据代替自己的 acceptance tests。

## 3. Synchronize Downstream Dependencies

- [x] 3.1 更新 `extract-shared-application-core`，使其依赖已批准的架构方向，而不是四项 spike 全通过。
- [x] 3.2 更新 `establish-desktop-foundation`，使其消费架构决定和共享 contracts，并把 clean-VM release matrix 留给 hardening。
- [x] 3.3 更新 `add-local-opencode-workbench`，明确该 change 自己拥有生产 OpenCode 集成验收。
- [x] 3.4 更新 `add-writing-ppt-and-obsidian-rag`，明确该 change 自己拥有 PPT 与本地 embedding/LanceDB 验收。
- [x] 3.5 更新 `harden-windows-desktop-release`，明确其拥有最终 Windows 发布门禁。
- [x] 3.6 同步总体实施计划和可行性结果文档。

## 4. Complete the Handoff

- [x] 4.1 严格校验本 change 及所有受影响下游 OpenSpec changes。
- [x] 4.2 检查过时的“四项全部通过才可抽取”描述已移除。
- [x] 4.3 记录下一实施 change 为 `extract-shared-application-core`。

**Completion Quality Gate:**

- [x] 没有待完成的 feasibility prerequisite。
- [x] 没有修改生产应用路径。
- [x] Foundation 可以启动，但 release 仍保持未批准。

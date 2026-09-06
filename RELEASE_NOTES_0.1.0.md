# CoworkAny 0.1.0 Release Notes

## 中文

### 发布范围

`0.1.0` 是当前 CoworkAny Windows 桌面端的绿色便携版本。它将共享工作台 UI、Provider 配置、本地运行时、skill 目录和 Tauri 桌面壳组合为可复制运行的发行包。

### 主要内容

- 统一 AI 消息展示：正文与 thinking/reasoning、工具调用过程分离，过程信息默认折叠。
- 完善消息 Markdown 展示、会话回合顺序、历史会话加载和入口级会话隔离。
- 支持 AI、Agent、写作、PPT、图片和工作流入口的并行任务状态展示。
- 为工作流任务提供持久化配置、运行结果和节点级错误反馈。
- 为任务状态提供可区分的背景色，帮助识别排队、运行、完成、失败和取消状态。
- 绿色版将运行时数据放在可执行文件旁的 `data` 目录，便于复制和备份。

### 构建产物

```text
CoworkAny-Windows-x64-portable.zip
```

该版本为未签名的 Windows x64 便携包。首次运行时请根据 Windows 安全提示确认来源，并在应用内配置自己的 Provider。

### 验证

- Workbench message surface tests: 37/37 passed
- Workbench UI typecheck: passed
- Desktop release regression and packaging checks: run as part of the release build

### 已知事项

- 发布包不包含真实 Provider API Key。
- Windows Defender 或企业安全策略可能对未签名的便携程序显示额外提示。
- 具体模型能力、速率限制和费用取决于用户配置的 Provider。

## English

### Scope

`0.1.0` is the current portable Windows desktop release of CoworkAny. It packages the shared workbench UI, provider configuration, local runtime, skill catalog, and Tauri shell into a copyable desktop bundle.

### Highlights

- Separates assistant answers from thinking/reasoning and tool-call details; execution details are collapsed by default.
- Improves Markdown rendering, turn ordering, history loading, and entry-scoped session isolation.
- Supports parallel task status display across AI, agent, writing, presentation, image, and workflow entries.
- Persists workflow configuration and results and surfaces node-level errors.
- Uses distinct task-status backgrounds for queued, running, completed, failed, and cancelled states.
- Stores portable runtime data in the `data` directory beside the executable for easy copying and backup.

### Artifact

```text
CoworkAny-Windows-x64-portable.zip
```

This is an unsigned Windows x64 portable package. Review any Windows security warning on first launch and configure your own provider inside the application.

### Verification

- Workbench message surface tests: 37/37 passed
- Workbench UI typecheck: passed
- Desktop release regression and packaging checks: run as part of the release build

### Known considerations

- The release package does not contain real provider API keys.
- Windows Defender or enterprise security policy may show an additional warning for an unsigned portable application.
- Model capabilities, rate limits, and costs depend on the provider configured by the user.

## Purpose

定义桌面端不依赖云 worker 的 `ppt-master` 执行、环境探测和本地产物行为。

## ADDED Requirements

### Requirement: PPT generation is an OpenCode Skill execution

桌面 PPT SHALL 由本地 OpenCode session 激活 `ppt-master` Skill 并调用私有 Python 环境执行；系统 MUST NOT 调用 `ppt-master worker`、Railway、R2 或云端临时产物服务。

#### Scenario: Generate a presentation
- **GIVEN** OpenCode、Python、字体和 `ppt-master` probes 全部通过
- **WHEN** 用户要求生成 PPT
- **THEN** OpenCode 在当前项目工作目录执行 Skill 并生成本地 PPTX

#### Scenario: Modify a presentation
- **GIVEN** 当前项目已有 PPT 源文件和稳定 OpenCode session
- **WHEN** 用户要求修改某些页面
- **THEN** OpenCode 使用当前项目上下文生成新版本并保留旧产物

### Requirement: PPT runtime is capability-probed

启动门禁 SHALL 验证 Python 架构/版本、必要 imports、Skill 加载、字体目录和真实中英文字形/PPT 输出，而不是只比较版本字符串。

#### Scenario: System Python is compatible
- **GIVEN** 系统 Python 和隔离依赖环境通过完整 PPT probe
- **WHEN** runtime resolver 选择执行环境
- **THEN** 可复用该绝对路径且本次运行不再次搜索 PATH

#### Scenario: Python or font probe fails
- **GIVEN** 系统环境缺依赖或无法正确渲染中文字形
- **WHEN** 强制启动门禁运行
- **THEN** 自动安装/修复私有 runtime，未通过前不进入主界面

### Requirement: PPT outputs are durable local artifacts

PPTX、SVG、预览和诊断文件 SHALL 在本地项目目录完成后登记为 artifacts，大文件不得经 IPC base64 传输。

#### Scenario: PPT completes successfully
- **GIVEN** Skill 已生成最终 PPTX
- **WHEN** artifact detector 验证路径、类型、大小和哈希
- **THEN** 应用登记相对路径并允许应用内或外部程序打开

#### Scenario: PPT execution fails partially
- **GIVEN** 项目目录存在部分中间文件但最终 PPTX 未完成
- **WHEN** run 失败
- **THEN** run 标记失败、诊断文件可见且未把部分 PPTX 标记为成功产物


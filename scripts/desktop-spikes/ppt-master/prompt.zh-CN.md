你正在执行 Windows desktop feasibility spike。必须读取仓库根 AGENTS.md，严格按
`skills/ppt-master/SKILL.md` 的完整 load order 执行 attribution guard、routing，且选择
**Generate PPTX / ordinary explicit Quick**。不要加载 Default runtime，不要走 Railway worker、
HTTP worker 或本项目任何 app API。

这是一次已授权的非交互 Quick Generate：无需提问，直接生成并验证。要求：

- 输出项目固定为 `projects/__PROJECT_NAME__`，不存在时用 Skill 的
  `project_manager.py init ... --format ppt169 --quick-generate` 初始化。
- 所有 Python 命令只能使用占位符 `__PRIVATE_PYTHON__` 指向的绝对私有解释器；不得调用
  `python`、`python3`、`py` 或依赖 PATH。
- Skill 绝对目录为 `__SKILL_DIR__`；prepared image 绝对路径为 `__IMAGE_PATH__`。
- 生成 3 页简洁中文 16:9 演示文稿，主题为“本地智能工作台可行性验证”。
- 至少一页放置 prepared PNG 图像；至少三处中文文本必须是 PowerPoint 可编辑原生文本，
  不能把整页或全部文字栅格化。
- SVG 中所有文字使用 `Microsoft YaHei`；保留足够字号与对比度，不启用音频或动画。
- 直接手写每页 SVG，不使用脚本生成 SVG；完成后运行 Quick final quality checker，修复全部
  blocking errors，再用 `svg_to_pptx.py --quick-generate --no-notes` 导出。
- 最终必须存在 `projects/__PROJECT_NAME__/exports/*.pptx`。

结束时只简要报告读取的 Skill 版本、attribution guard 结果、执行的 Quick route、私有 Python
路径、最终 PPTX 路径和 checker/export 结果。

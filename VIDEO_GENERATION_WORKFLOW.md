# 视频生成工作流说明

## 概述

视频生成功能使用 **CrewAI 多智能体协作** 和 **Sora2** 视频生成服务，实现从用户需求到最终视频的完整流程。

## 工作流程

### 1. 创意策划（Creative Agent）
- **角色**：分析用户需求，制定创意策略
- **工具**：`optimize_prompt_tool`
- **输出**：优化后的创意策略和提示词

### 2. 导演（Director Agent）
- **角色**：将创意转化为视觉语言，规划分镜脚本
- **工具**：`plan_storyboard_tool`
- **输出**：分镜脚本列表（JSON 格式），每个镜头不超过 10 秒

### 3. 审核（Reviewer Agent / 制片人）
- **角色**：审核分镜质量，合并镜头为视频任务
- **工具**：`review_storyboard_tool`, `merge_storyboards_to_video_tasks_tool`
- **输出**：审核通过的分镜脚本，合并为 10 秒的视频任务

### 4. 视觉设计（Visual Agent，可选）
- **角色**：生成关键帧，控制视觉风格
- **工具**：`generate_keyframe_tool`
- **输出**：包含关键帧的分镜脚本

### 5. 制片（Producer Agent）
- **角色**：提交视频生成任务
- **工具**：`generate_video_clip_tool`
- **输出**：视频生成任务提交结果（使用 **Sora2**）

### 6. 剪辑（Editor Agent）
- **角色**：拼接最终视频
- **工具**：`stitch_video_tool`
- **输出**：最终视频的 CDN URL

## Sora2 视频生成

### 配置

在 `submodules/saleagent/apps/agent/.env` 中设置：

```bash
PROVIDER_VIDEO=sora2
RUNNINGHUB_SORA2_WORKFLOW_ID=1985261217524629506
RUNNINGHUB_API_KEY=your_api_key
```

### 生成流程

1. **任务提交**：制片智能体调用 `generate_video_clip_tool`
2. **异步处理**：任务提交到 RunningHub Sora2 工作流
3. **状态跟踪**：任务状态保存在 `video_tasks` 表
4. **结果回调**：通过 webhook 接收生成结果
5. **自动拼接**：所有片段完成后，自动触发拼接

### 视频任务规则

- 每个视频任务对应 **10 秒**的视频片段
- 多个镜头会合并为一个 10 秒任务（节约成本）
- 使用异步模式，避免长时间阻塞

## 前端调用

前端通过 `/api/crewai/agent` 端点调用，传递以下参数：

```json
{
  "prompt": "用户需求描述",
  "goal": "用户需求描述",
  "use_crewai": true,
  "total_duration": 10.0,
  "styles": [],
  "image_control": false
}
```

## 实时进度展示

前端通过 SSE（Server-Sent Events）实时接收进度：

- **创意策划**：💡 分析需求，制定策略
- **导演**：🎬 规划分镜脚本
- **审核**：✅ 审核分镜质量
- **视觉设计**：🎨 生成关键帧（可选）
- **制片**：📹 提交视频生成任务
- **剪辑**：✂️ 拼接最终视频

## 人机协同交互

在视频生成过程中，用户可以：

1. **查看实时进度**：每个智能体的工作状态
2. **提供反馈**：在智能体工作时提供调整建议
3. **干预流程**：调整参数或重新生成

## 注意事项

1. **视频生成时间**：每个 10 秒片段需要 3-5 分钟
2. **异步处理**：视频生成是异步的，不会阻塞前端
3. **自动拼接**：所有片段完成后自动拼接
4. **成本优化**：按 10 秒一个任务生成，节约成本

## 故障排查

### 视频生成失败

1. 检查 `PROVIDER_VIDEO` 是否设置为 `sora2`
2. 检查 `RUNNINGHUB_SORA2_WORKFLOW_ID` 是否正确
3. 检查 `RUNNINGHUB_API_KEY` 是否有效
4. 查看后端日志中的错误信息

### 任务一直处于 pending

1. 检查 RunningHub 工作流是否正常运行
2. 检查 webhook 配置
3. 查看 `video_tasks` 表中的任务状态


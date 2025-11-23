# Sora2 视频生成配置指南

本文档说明如何配置 SaleAgent 使用 Sora2 进行视频生成。

## 环境变量配置

在 `submodules/saleagent/apps/agent/.env` 文件中配置：

```bash
# 视频生成提供商（必须设置为 sora2）
PROVIDER_VIDEO=sora2

# RunningHub Sora2 工作流 ID
RUNNINGHUB_SORA2_WORKFLOW_ID=1985261217524629506

# RunningHub API 密钥
RUNNINGHUB_API_KEY=your_api_key_here
```

## 工作流程

当 `PROVIDER_VIDEO=sora2` 时，视频生成流程如下：

1. **创意策划** - 分析用户需求，优化提示词
2. **导演** - 规划分镜脚本（每个镜头不超过10秒）
3. **审核** - 审核分镜质量，合并镜头为10秒的视频任务
4. **视觉设计**（可选）- 生成关键帧
5. **制片** - 提交视频生成任务到 RunningHub Sora2 工作流
6. **剪辑** - 等待所有视频片段完成后，自动拼接为最终视频

## 视频生成任务

- 每个视频任务对应一个 10 秒的视频片段
- 使用异步模式，避免长时间阻塞
- 任务提交后，通过 webhook 或后台轮询获取结果
- 所有片段完成后，自动触发拼接

## 验证配置

启动后端后，检查日志中是否有：

```
Using video provider: sora2
```

如果看到错误信息，请检查：
1. `PROVIDER_VIDEO` 是否设置为 `sora2`
2. `RUNNINGHUB_SORA2_WORKFLOW_ID` 是否正确
3. `RUNNINGHUB_API_KEY` 是否有效

## 注意事项

1. **视频生成时间**：每个 10 秒视频片段需要 3-5 分钟生成
2. **并发限制**：RunningHub 可能有并发数限制，超出限制的任务会进入队列等待
3. **成本考虑**：按 10 秒一个任务生成，可以节约成本
4. **异步处理**：视频生成是异步的，前端会实时显示进度

## 故障排查

### 任务一直处于 pending 状态

1. 检查 RunningHub 工作流是否正常运行
2. 检查 webhook 配置是否正确
3. 查看后端日志中的错误信息

### 视频生成失败

1. 检查 prompt 是否包含无效字符
2. 检查 RunningHub API 密钥是否有效
3. 查看 RunningHub 工作流的执行日志


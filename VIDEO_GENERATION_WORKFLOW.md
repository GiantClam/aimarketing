# Video Workflow Plan

视频能力先保留四个 RunningHub 入口：

- 文生视频
- 图生视频
- 口播数字人
- 视频高清化

暂不接入视频复刻、热门视频检索、人脸融合等延展入口。所有视频任务都按异步任务处理，提交后立即返回任务记录，前端通过轮询或后续 webhook 更新状态，任务成功后转存最终视频，避免 RunningHub 结果 URL 过期。

## 目标

1. 让用户能在视频工作台提交长耗时视频任务，而不是等待同步响应。
2. 统一文生视频和图生视频入口，底层都走 RunningHub seedance2.0 标准模型 API。
3. 通过 RunningHub workflow API 接入口播数字人与视频高清化。
4. 支持口播数字人从本地上传或素材库选择音频、人物图片。
5. 支持视频高清化上传或选择源视频。
6. 保存任务状态、错误信息、RunningHub 原始结果、最终转存后的视频资产。

### 2 天上线 Goal

在 2 个工作日内上线一个可对外使用的 Video MVP，范围严格收敛为文生视频、图生视频、口播数字人、视频高清化四个入口；所有入口统一接入 RunningHub，并采用异步任务机制，做到“提交即返回任务、前端可持续轮询状态、成功后可拿到最终视频、失败时可见明确错误信息”。

对应验收口径：

1. 用户可在同一视频工作台完成文生视频与图生视频提交，二者共用一套 seedance2.0 提交与轮询链路。
2. 用户可提交口播数字人任务，支持音频和人物图片的上传，且保留素材库选择入口。
3. 用户可提交视频高清化任务，支持源视频上传，且保留素材库选择入口。
4. 后端为四类视频任务统一落库平台任务记录，保存 provider task id、运行状态、错误信息、最终视频地址和原始响应。
5. 前端可基于平台 runId 轮询任务状态，并在任务成功后稳定展示最终视频结果。
6. 本次不交付视频复刻、热门视频检索、人脸融合等非核心入口，避免超出 2 天上线窗口。

## 能力边界

| 功能 | 状态 | Provider | 说明 |
| --- | --- | --- | --- |
| 文生视频 | 保留并接入 | RunningHub seedance2.0 标准模型 API | 用户输入 prompt，输出视频 |
| 图生视频 | 保留并接入 | RunningHub seedance2.0 标准模型 API | 用户输入 prompt、首帧图片，可选尾帧图片，输出视频 |
| 口播数字人 | 保留并接入 | RunningHub workflow API | workflowId `2019410250268418050`，输入音频和人物图片 |
| 视频高清化 | 保留并接入 | RunningHub workflow API | workflowId `2064172986302812162`，输入源视频，输出高清视频 |
| 视频复刻 | 暂不接入 | 无 | 继续 deferred |
| 热门视频检索 | 暂不接入 | 无 | 继续 deferred |
| 人脸融合 | 暂不接入 | 无 | 本轮不做 |

## 现有代码可复用部分

当前仓库已有一套 RunningHub 和媒体任务骨架：

- `lib/platform/runninghub.ts`
  - 已封装 `RUNNINGHUB_API_KEY`
  - 已封装 submit/query 形态
  - 当前只按 `RUNNINGHUB_VIDEO_ENDPOINT` 区分视频目标
- `app/api/platform/media/run/route.ts`
  - 已有异步提交入口
  - 会校验登录和 `video_generation` 权限
  - 会将 `platformAction`、`userId`、`enterpriseId` 传给 provider
- `app/api/platform/media/tasks/[taskId]/route.ts`
  - 已有查询 RunningHub task 的 API
- `components/platform/workspace-capabilities-media-workspace.tsx`
  - 已有任务提交、4 秒轮询、终态判断逻辑
- `lib/platform/task-run-store.ts`
  - 已有 `platformTaskRuns`、events、artifacts、workItems 表
  - 可保存 `externalRunId`、`normalizedResult`、artifact、video work item

方案优先复用这些模块，不新建第二套任务系统。

## RunningHub 调用形态

### 文生视频

使用 RunningHub 标准模型 API：

```text
POST https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0-fast/text-to-video
```

请求字段：

```json
{
  "prompt": "视频生成提示词，必填",
  "resolution": "720p",
  "duration": "5",
  "generateAudio": true,
  "ratio": "adaptive",
  "webSearch": false,
  "returnLastFrame": false,
  "seed": -1
}
```

字段约束：

- `prompt`: 1 到 20480 字符
- `resolution`: `480p`、`720p`、`1080p`、`2k`、`4k`
- `duration`: `-1`、`4` 到 `15`
- `ratio`: `adaptive`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`21:9`
- `seed`: `-1` 到 `2147483647`

### 图生视频

使用 RunningHub 标准模型 API：

```text
POST https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video
```

请求字段：

```json
{
  "prompt": "视频生成提示词，可选",
  "resolution": "720p",
  "duration": "5",
  "firstFrameUrl": "https://example.com/first-frame.png",
  "lastFrameUrl": "https://example.com/last-frame.png",
  "generateAudio": true,
  "ratio": "adaptive",
  "realPersonMode": true,
  "conversionSlots": ["all"],
  "returnLastFrame": false,
  "seed": -1
}
```

字段约束：

- `firstFrameUrl`: 必填，最多 1 张图片，单张 30 MB
- `lastFrameUrl`: 可选，最多 1 张图片，单张 30 MB
- 图片来源支持公开 URL、Base64 data URI、RunningHub 上传结果 URL、平台素材库 URL
- `realPersonMode`: 真人素材建议默认开启
- `conversionSlots`: 默认 `["all"]`，也可传 `["firstFrameUrl"]` 或 `["lastFrameUrl"]`

### 口播数字人

使用 RunningHub workflow API：

```text
workflowId: 2019410250268418050
source: https://www.runninghub.cn/workflow/2019410250268418050
api json: /Users/beihuang/Downloads/直播带货数字人对口型RCM+Infinite Talk+VoxCPM TTS1.5_api.json
```

输入来源：

- 音频：用户上传音频，或从素材库选择音频
- 人物图片：用户上传人物图片，或从素材库选择人物图片
- 口播文案：可选。若用户没有上传音频，可走 workflow 内的 VoxCPM TTS 链路生成音频
- 场景 prompt：可选，用于控制数字人展示语境
- seed：可选

关键节点映射：

| 节点 | 类型 | 用途 | 用户字段 |
| --- | --- | --- | --- |
| `243` | `LoadAudio` | 默认音频输入 | `audioUrl` 或素材库音频 |
| `244` | `String Literal` | TTS 阅读文稿 | `script` |
| `257` | `VoxCPM_TTS` | 文本转语音 | `script`、可选音色参考 |
| `262` | `SoundFlow_TrimAudio` | 音频裁剪 | `audioTrimStart`、`audioTrimEnd` |
| `288` | 音频链路输出 | 最终驱动口型音频 | 系统内部 |
| `343` | `LoadImage` | 人物图片输入 | `avatarImageUrl` 或素材库图片 |
| `349` | `PrimitiveStringMultiline` | 场景/动作 prompt | `prompt` |
| `128` | `WanVideoSampler` | 采样 seed | `seed` |
| `131` | `VHS_VideoCombine` | 最终 mp4 输出 | 系统内部 |

前端交互要求：

- 音频输入区提供两个 Tab：上传、素材库。
- 人物图片输入区提供两个 Tab：上传、素材库。
- 当用户上传音频时，`script` 只作为字幕/任务说明，不强制参与 TTS。
- 当用户未上传音频但填写 `script` 时，走 VoxCPM TTS。
- 上传文件先进入平台素材存储或 RunningHub upload，再把 URL 或 fileName 写入 workflow 节点。

### 视频高清化

使用 RunningHub workflow API：

```text
workflowId: 2064172986302812162
source: https://www.runninghub.cn/workflow/2064172986302812162
api json: /Users/beihuang/Downloads/LTX2.3视频高清修复-视频去模糊高清化工作流_api (1).json
```

输入来源：

- 源视频：用户上传视频，或从素材库选择视频
- 增强目标 prompt：可选，默认“将视频转换为超高清画质，在消除伪影的同时重建高频细节，显著提升画面清晰度”
- 处理时长：可选，默认 10 秒或由产品限制决定
- seed：可选

关键节点映射：

| 节点 | 类型 | 用途 | 用户字段 |
| --- | --- | --- | --- |
| `33` | `VHS_LoadVideo` | 源视频输入 | `sourceVideoUrl` 或素材库视频 |
| `35` | `CR Text` | 高清化 prompt | `prompt` |
| `42` | `ImpactInt` | 处理秒数 | `durationLimit` |
| `10` | `Seed (rgthree)` | seed | `seed` |
| `43` | `VHS_VideoCombine` | 高清视频输出 | 系统内部 |
| `44` | `VHS_VideoCombine` | 对比视频输出 | 系统内部，可选展示 |

前端交互要求：

- 源视频输入区提供两个 Tab：上传、素材库。
- 默认只展示最终高清视频。
- 如果 RunningHub 返回对比视频，也可在结果详情中展示“前后对比”。

## 异步任务设计

### 状态模型

平台内部状态：

| 平台状态 | RunningHub 状态 | 说明 |
| --- | --- | --- |
| `queued` | `QUEUED` | 已提交或排队中 |
| `running` | `RUNNING` | RunningHub 正在处理 |
| `succeeded` | `SUCCESS` | 结果已生成并完成转存 |
| `failed` | `FAILED` | RunningHub 失败或转存失败 |
| `cancelled` | 取消任务 | 后续可接 RunningHub cancel API |

RunningHub 原始状态、`errorCode`、`errorMessage`、`failedReason`、`usage` 都保存到 `normalizedResult`，便于排障和计费分析。

### 提交流程

1. 前端提交视频任务。
2. API 校验登录、企业、`video_generation` 权限。
3. API 校验功能类型和输入字段。
4. API 创建 `platformTaskRuns` 记录，状态为 `queued`。
5. 如果有本地上传文件，先上传到平台素材存储或 RunningHub upload。
6. 根据功能类型构造 RunningHub 标准模型请求或 workflow `nodeInfoList`。
7. 提交 RunningHub 任务。
8. 保存 `externalSystem = "runninghub"`、`externalRunId = taskId`。
9. 返回平台 `runId`、RunningHub `taskId`、初始状态。

### 查询和轮询流程

1. 前端拿到 `runId` 后每 4 秒轮询一次任务详情。
2. 后端使用 `externalRunId` 调用 RunningHub query。
3. 若仍是 `QUEUED` 或 `RUNNING`，更新状态并返回。
4. 若 `FAILED`，保存失败原因，状态置为 `failed`。
5. 若 `SUCCESS`，提取 `results` 中 `outputType` 为 `mp4` 或视频类型的 URL。
6. 后端立即下载 RunningHub 结果并转存到平台对象存储。
7. 保存 `platformArtifacts`，类型为 `file`，并提升为 `PlatformWorkItemType = "video"`。
8. 返回平台稳定视频 URL、RunningHub 原始结果、耗时和消耗信息。

### Webhook

标准模型 API 支持在提交时传 `webhookUrl`。第一版可以先做轮询，后续补 webhook：

- `POST /api/platform/media/runninghub/webhook`
- 校验签名或使用 webhook secret
- 通过 taskId 找 `platformTaskRuns.externalRunId`
- 更新状态并触发结果转存

轮询必须保留，因为 webhook 可能失败、延迟或被环境防火墙拦截。

### 结果转存

RunningHub 文档提示结果 URL 有效期通常为 24 小时。平台不能直接长期保存 RunningHub URL。

成功后必须：

1. 下载 `results[].url`。
2. 判断 MIME 和扩展名。
3. 写入平台对象存储。
4. 在 artifact payload 中保留 RunningHub 原始 URL、nodeId、outputType、taskId、过期风险标记。
5. 前端只使用平台稳定 URL 播放和下载。

若转存失败：

- 任务状态标记为 `failed` 或 `succeeded_with_transfer_error`。当前 `PlatformTaskRunStatus` 没有部分成功状态，第一版建议标记 `failed`，并在事件中写明 RunningHub 已成功但转存失败。
- 保留 RunningHub 临时 URL 方便人工补救，但 UI 明确提示链接可能过期。

## API 设计建议

复用现有媒体 API，新增明确的 video feature 参数。

### 提交

```text
POST /api/platform/media/run?target=ai-video&action=video-generation
POST /api/platform/media/run?target=ai-video&action=digital-human
POST /api/platform/media/run?target=ai-video&action=video-enhance
```

视频生成请求通过 `mode` 区分文生和图生：

```json
{
  "featureId": "video-generation",
  "mode": "text-to-video",
  "params": {
    "prompt": "一支 15 秒产品发布视频",
    "resolution": "720p",
    "duration": "5",
    "generateAudio": true,
    "ratio": "16:9",
    "webSearch": false,
    "returnLastFrame": false,
    "seed": -1
  }
}
```

```json
{
  "featureId": "video-generation",
  "mode": "image-to-video",
  "params": {
    "prompt": "让人物自然转身介绍产品",
    "firstFrameUrl": "https://cdn.example.com/first.png",
    "lastFrameUrl": "https://cdn.example.com/last.png",
    "resolution": "720p",
    "duration": "5",
    "generateAudio": true,
    "ratio": "adaptive",
    "realPersonMode": true,
    "conversionSlots": ["all"],
    "returnLastFrame": false,
    "seed": -1
  }
}
```

口播数字人：

```json
{
  "featureId": "digital-human",
  "params": {
    "avatarImageUrl": "https://cdn.example.com/avatar.png",
    "audioUrl": "https://cdn.example.com/speech.mp3",
    "script": "欢迎来到直播间，今天介绍新品。",
    "prompt": "模特正在做产品展示，进行电商直播带货",
    "audioTrimStart": 0,
    "audioTrimEnd": 6.1,
    "seed": -1
  }
}
```

视频高清化：

```json
{
  "featureId": "video-enhance",
  "params": {
    "sourceVideoUrl": "https://cdn.example.com/source.mp4",
    "prompt": "将视频转换为超高清画质，在消除伪影的同时重建高频细节，显著提升画面清晰度",
    "durationLimit": 10,
    "seed": -1
  }
}
```

### 查询

```text
GET /api/platform/media/tasks/{runId}?target=ai-video
```

建议查询以平台 `runId` 为主，而不是直接暴露 RunningHub `taskId`。响应中可以同时带 `externalRunId` 便于排障。

返回结构：

```json
{
  "data": {
    "runId": 123,
    "taskId": "2013508786110730241",
    "featureId": "video-generation",
    "status": "running",
    "providerStatus": "RUNNING",
    "progress": null,
    "artifacts": [],
    "error": null,
    "usage": null
  }
}
```

成功后：

```json
{
  "data": {
    "runId": 123,
    "taskId": "2013508786110730241",
    "featureId": "video-generation",
    "status": "succeeded",
    "providerStatus": "SUCCESS",
    "artifacts": [
      {
        "type": "video",
        "url": "https://cdn.aimarketingsite.com/platform/video/123/output.mp4",
        "mimeType": "video/mp4",
        "source": "runninghub"
      }
    ],
    "usage": {
      "taskCostTime": "120"
    }
  }
}
```

## 配置

当前 `.env.example` 只有通用 RunningHub 配置。建议补充更明确的视频配置：

```bash
RUNNINGHUB_API_KEY=
RUNNINGHUB_BASE_URL=https://www.runninghub.cn
RUNNINGHUB_QUERY_PATH=/openapi/v2/query
RUNNINGHUB_UPLOAD_PATH=/openapi/v2/media/upload/binary

RUNNINGHUB_SEEDANCE_TEXT_TO_VIDEO_ENDPOINT=/openapi/v2/rhart-video/sparkvideo-2.0-fast/text-to-video
RUNNINGHUB_SEEDANCE_IMAGE_TO_VIDEO_ENDPOINT=/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video

RUNNINGHUB_DIGITAL_HUMAN_WORKFLOW_ID=2019410250268418050
RUNNINGHUB_VIDEO_ENHANCE_WORKFLOW_ID=2064172986302812162

RUNNINGHUB_WEBHOOK_SECRET=
RUNNINGHUB_RESULT_TRANSFER_BUCKET=
```

兼容策略：

- 第一版可以继续支持旧的 `RUNNINGHUB_VIDEO_ENDPOINT`。
- 若配置了新 endpoint，则按 feature 精准路由。
- 若只配置旧 endpoint，则仅允许旧通用视频入口，不启用四入口精细能力。

## 前端工作台调整

视频分组保留四个 feature：

1. `video-generation`
   - 模式切换：文生视频、图生视频
   - 文生视频必填 prompt
   - 图生视频必填首帧图片，可选尾帧图片和 prompt
2. `digital-human`
   - 人物图片：上传或素材库
   - 音频：上传或素材库
   - 文案：可选。无音频时用于 TTS
3. `video-enhance`
   - 源视频：上传或素材库
   - 增强目标 prompt
   - 处理时长限制
4. 历史任务
   - 展示运行中、成功、失败任务
   - 成功任务展示平台稳定视频 URL

移除或隐藏本轮不接入的入口：

- `face-fusion`
- `video-remake-studio`
- `hot-video-research`

## 实施顺序

1. 抽象 RunningHub video feature routing。
2. 扩展配置，加入 seedance 文生/图生 endpoint 与两个 workflowId。
3. 增加 RunningHub workflow API submit helper，支持 api json 节点覆盖。
4. 增加平台 runId 维度的异步任务提交与查询。
5. 接入结果转存和 artifact/work item 保存。
6. 调整视频工作台 UI，只展示四个保留入口。
7. 增加单元测试覆盖路由、payload 映射、状态映射、结果转存失败。
8. 增加一条手动验收路径：提交任务、轮询、成功、播放转存视频。

## 验收标准

- 文生视频提交后返回平台 `runId`，前端进入 running 状态。
- 图生视频支持上传或素材库首帧图片，提交后进入 running 状态。
- 口播数字人支持上传或素材库音频、人物图片。
- 口播数字人在无音频但有文案时走 TTS 路径。
- 视频高清化支持上传或素材库源视频。
- 所有视频任务都可轮询状态。
- 失败任务展示 RunningHub 错误信息。
- 成功任务不直接依赖 RunningHub 临时 URL，最终播放平台转存 URL。
- 任务记录保存 provider taskId、原始结果、usage、artifact。

## 参考资料

- RunningHub 标准模型 API 文档附件：text-to-video、image-to-video
- RunningHub workflow API JSON：口播数字人、视频高清化
- RunningHub workflow API 集成说明：读取 workflow JSON、生成 `nodeInfoList`、上传文件、提交任务、轮询结果

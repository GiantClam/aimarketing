# Workflow Canvas M3 性能验收报告

- 状态：**PASS**
- 生成时间：`2026-07-16T20:37:30Z`
- 基准：生产 build、Chromium/Chrome Stable、无 DevTools CPU throttle；每个可测场景预热 1 次、测量 `5` 次。
- 本文件由 `scripts/workflow_canvas_m3_performance.py` 生成；缺失环境或缺失原始测量不会被填充为假数据。

## 原始测量与判定

| 场景 | 原始值 | 判定 |
| --- | --- | --- |
| `100_nodes_open` | `{"samplesMs":[471.73120800289325,458.6528330000874,445.4256249991886,448.87854199987487,464.00695799820824],"medianMs":458.6528330000874,"p95Ms":471.73120800289325,"verdict":"PASS"}` | `PASS` |
| `100_nodes_interaction` | `{"samples":[{"durationMs":10011.499999999254,"averageFps":59.83119412675869,"pointerToPaintP95Ms":15.599999998509702,"pointerSampleCount":620},{"durationMs":10004.19999999851,"averageFps":59.87485256193292,"pointerToPaintP95Ms":15.699999998510066,"pointerSampleCount":619},{"durationMs":10015.70000000149,"averageFps":59.80610441605787,"pointerToPaintP95Ms":15.500000002980414,"pointerSampleCount":622},{"durationMs":10012.200000002234,"averageFps":59.82701104650989,"pointerToPaintP95Ms":15.600000001490116,"pointerSampleCount":620},{"durationMs":10004.70000000149,"averageFps":59.871860225685005,"pointerToPaintP95Ms":15.60000000074524,"pointerSampleCount":620}],"medianAverageFps":59.83119412675869,"p95PointerToPaintMs":15.699999998510066,"verdict":"PASS"}` | `PASS` |
| `100_nodes_save` | `{"samples":[{"clientElapsedMs":15.600000001490116,"serverTiming":"workflow-patch;dur=11","serverDurationMs":11.0,"revision":2},{"clientElapsedMs":12.899999998509884,"serverTiming":"workflow-patch;dur=9","serverDurationMs":9.0,"revision":3},{"clientElapsedMs":10.699999999254942,"serverTiming":"workflow-patch;dur=8","serverDurationMs":8.0,"revision":4},{"clientElapsedMs":10.899999998509884,"serverTiming":"workflow-patch;dur=8","serverDurationMs":8.0,"revision":5},{"clientElapsedMs":9.5,"serverTiming":"workflow-patch;dur=8","serverDurationMs":8.0,"revision":6}],"serverTimingSamples":[11.0,9.0,8.0,8.0,8.0],"serverP95Ms":11.0,"verdict":"PASS","note":"Server-Timing is emitted by the workflow PATCH route; client elapsed time is not substituted for server P95."}` | `PASS` |
| `300_nodes_open` | `{"samplesMs":[572.7757079985167,561.3500420004129,554.1497920021357,559.6537919991533,565.6739160003781],"medianMs":561.3500420004129,"p95Ms":572.7757079985167,"verdict":"PASS"}` | `PASS` |
| `300_nodes_interaction` | `{"samples":[{"durationMs":10001.999999997764,"averageFps":55.388922215569266,"pointerToPaintP95Ms":12.399999997020132,"pointerSampleCount":499},{"durationMs":10015.8,"averageFps":58.40771580902175,"pointerToPaintP95Ms":12.199999999999818,"pointerSampleCount":532},{"durationMs":10007.80000000149,"averageFps":58.054717320481366,"pointerToPaintP95Ms":12.60000000074524,"pointerSampleCount":526},{"durationMs":10007.6,"averageFps":57.556257244494184,"pointerToPaintP95Ms":12.60000000074524,"pointerSampleCount":509},{"durationMs":10002.4,"averageFps":57.486203311205315,"pointerToPaintP95Ms":12.000000002235538,"pointerSampleCount":536}],"medianAverageFps":57.556257244494184,"p95PointerToPaintMs":12.60000000074524,"verdict":"PASS"}` | `PASS` |
| `300_nodes_memory` | `{"durationMs":300003.30000000075,"sampleCount":22,"initialUsedMb":110.626220703125,"finalUsedMb":110.626220703125,"incrementMb":0.0,"metric":"renderer_js_heap_used_bytes","verdict":"PASS"}` | `PASS` |
| `20_iterations_concurrency_3` | `{"verdict":"PASS","note":"Measured by workflow_canvas_m3_e2e.py; this script does not submit provider work a second time."}` | `PASS` |
| `worker_restart_recovery` | `{"samplesMs":[1931.7129160008335,1913.237291999394,1928.0387079998036,1940.7477079985256,1924.3084999980056],"p95Ms":1940.7477079985256,"verdict":"PASS","note":"Measured by workflow_canvas_m3_e2e.py --restart-after-submit with recovery timestamps."}` | `PASS` |
| `100_nodes_subgraph_import_m6` | `{"verdict":"OUT_OF_SCOPE","note":"M6 is not part of the M3 implementation scope; no fabricated measurement is recorded."}` | `OUT_OF_SCOPE` |

## Blocker / 备注

- 无

## 29.3 固定阈值

| 场景 | 阈值 |
| --- | --- |
| 100 节点 / 150 边打开 | P95 <= 2 秒 |
| 100 节点拖动/缩放 10 秒 | 平均 >= 45 FPS；P95 pointer-to-paint <= 50 ms |
| 300 节点 / 500 边打开 | P95 <= 4 秒 |
| 300 节点拖动/缩放 10 秒 | 平均 >= 30 FPS；P95 pointer-to-paint <= 100 ms |
| 300 节点稳定内存 | 5 分钟增量 <= 350 MB |
| 100 节点保存 | 服务端 P95 <= 500 ms |
| 20 iteration / 并发 3 | 实际并发 <= 3；collect 顺序 100% 正确（由 M3 E2E 提供） |
| Worker 重启恢复 | P95 <= 30 秒（由 M3 E2E/恢复日志提供） |
| 100 节点子图导入（M6） | P95 <= 2 秒；0 悬空边（M6 未纳入本脚本） |

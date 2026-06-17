# RAGFlow Railway Templates

本目录只提供 `aimarketing` 侧推荐的最小部署模板。

使用前请从 `RAGFlow` 官方 `docker/` 目录同步以下文件到本目录:

- `entrypoint.sh`
- `infinity_conf.toml`

推荐同步方式:

1. 从官方仓库对应版本的 `docker/` 目录复制
2. 保持 `RAGFLOW_IMAGE` 与复制文件版本一致

文件说明:

- `docker-compose.ragflow-core.yml`
  - 只保留 `ragflow + infinity + redis`
- `service_conf.r2-mysql-infinity.yaml.template`
  - 推荐生产版
- `service_conf.r2-postgres-infinity.experimental.yaml.template`
  - 实验版, 仅建议 staging 试跑

不要直接把实验版用于生产。

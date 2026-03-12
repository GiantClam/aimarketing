# Supabase RLS Fix

如果外部 video agent 在写入 Supabase 时遇到：

```text
new row violates row-level security policy
```

应检查外部服务是否使用了 `SUPABASE_SERVICE_ROLE_KEY`，而不是匿名 key。

## 正确配置

这些变量应该配置在外部 video agent 服务自己的 `.env` 中：

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 不推荐配置

```bash
SUPABASE_ANON_KEY=...
```

匿名 key 会受到 RLS 限制，不适合作为后端服务写库凭证。

## 说明

旧文档中提到的：

- `submodules/saleagent/apps/agent/.env`

已经不再适用，因为当前仓库不再内置 `saleagent` 子模块。

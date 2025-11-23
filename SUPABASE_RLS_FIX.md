# Supabase RLS 策略修复指南

## 问题描述

如果遇到以下错误：

```
ERROR: new row violates row-level security policy for table "jobs"
```

这是因为后端使用了 `SUPABASE_ANON_KEY`，该密钥受到 Supabase 的行级安全策略（RLS）限制。

## 解决方案

### 1. 使用 Service Role Key

后端服务必须使用 `SUPABASE_SERVICE_ROLE_KEY`，该密钥可以绕过 RLS 策略。

在 `submodules/saleagent/apps/agent/.env` 中配置：

```bash
# ❌ 错误：不要使用 ANON_KEY
# SUPABASE_ANON_KEY=eyJ...

# ✅ 正确：使用 SERVICE_ROLE_KEY
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. 获取 Service Role Key

1. 登录 Supabase Dashboard
2. 进入项目设置（Settings）
3. 选择 API（API Settings）
4. 找到 **Service Role Key**（不是 Anon Key）
5. 复制密钥到 `.env` 文件

### 3. 代码已自动处理

代码已更新，会按以下优先级选择密钥：

1. `SUPABASE_SERVICE_ROLE_KEY`（优先）
2. `SUPABASE_SERVICE_KEY`（兼容旧配置）
3. `SUPABASE_ANON_KEY`（最后选择，不推荐）

### 4. 验证配置

重启后端服务后，检查日志中是否有 Supabase 连接错误。如果仍然报错，请确认：

1. ✅ `SUPABASE_SERVICE_ROLE_KEY` 已正确设置
2. ✅ 环境变量文件路径正确（`submodules/saleagent/apps/agent/.env`）
3. ✅ 后端服务已重启

## 安全注意事项

⚠️ **重要**：`SUPABASE_SERVICE_ROLE_KEY` 具有完全访问权限，可以绕过所有 RLS 策略。

- ✅ 仅在**后端服务**中使用
- ❌ **不要**在前端代码中使用
- ❌ **不要**提交到 Git 仓库
- ✅ 添加到 `.gitignore`

## 替代方案（不推荐）

如果无法使用 Service Role Key，需要：

1. 在 Supabase Dashboard 中为 `jobs` 表配置 RLS 策略
2. 允许匿名用户插入数据（安全性较低）

但这种方式不推荐，因为会降低数据库安全性。


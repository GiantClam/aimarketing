# Kimi2.5 Free Model 使用指南

## 方式 1: 快速运行命令

```bash
cd /Users/beihuang/Documents/github/aimarketing

# 创建新功能
/Users/beihuang/.opencode/bin/opencode --model opencode/kimi-k2.5-free --prompt "你的任务描述" < input.json

# 或者使用管道
echo '{"task": "创建视频生成API"}' | opencode --model opencode/kimi-k2.5-free
```

## 方式 2: 使用脚本

```bash
# 查看当前 API
ls app/api/

# 创建新 API（如视频生成）
echo '{"prompt": "Create app/api/video/generate/route.ts for video generation with stability AI"}' | \
  /Users/beihuang/.opencode/bin/opencode --model opencode/kimi-k2.5-free
```

## 方式 3: 交互式使用

```bash
cd /Users/beihuang/Documents/github/aimarketing
/Users/beihuang/.opencode/bin/opencode --model opencode/kimi-k2.5-free
```

## 推荐工作流

1. **终端 1**: `npm run dev` (保持运行)
2. **终端 2**: 使用 Kimi2.5 创建功能
3. **浏览器**: http://localhost:3000 查看结果

## 示例命令

```bash
# 创建知识库 API
echo '{"prompt": "Create app/api/knowledge/upload/route.ts for uploading documents"}' | \
  opencode --model opencode/kimi-k2.5-free

# 创建用户管理
echo '{"prompt": "Create app/api/users/profile/route.ts for user profile management"}' | \
  opencode --model opencode/kimi-k2.5-free

# 创建视频生成
echo '{"prompt": "Create app/api/video/generate/route.ts with stability ai integration"}' | \
  opencode --model opencode/kimi-k2.5-free
```

## 已创建的功能

| API | 功能 |
|-----|------|
| `app/api/auth/login/` | JWT 登录 |
| `app/api/auth/register/` | 注册 |
| `app/api/auth/me/` | 获取用户 |
| `app/api/auth/logout/` | 登出 |
| `app/api/content/generate/` | 内容生成 |

## 待创建（按 PRD 顺序）

- [ ] 视频生成模块
- [ ] 用户管理模块  
- [ ] 知识库模块
- [ ] RBAC 权限模块
- [ ] 线索管理模块

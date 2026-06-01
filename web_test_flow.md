# Web 测试流程 (Kimi 2.5 + agent-browser)

## 测试流程

```
1. Kimi 2.5 生成代码
   ↓
2. 开发服务器启动 (npm run dev)
   ↓
3. Kimi 2.5 调用 agent-browser 测试
   ↓
4. 截图验证 UI
   ↓
5. 返回结果
```

## Kimi 2.5 测试命令

```bash
# 生成代码后，Kimi 可直接调用：
agent-browser open http://localhost:3000
agent-browser screenshot
agent-browser console --level error
```

## 集成测试示例

```bash
# 终端 1: 启动开发服务器
cd /Users/beihuang/Documents/github/aimarketing
npm run dev

# 终端 2: Kimi 2.5 执行任务并测试
echo '{"prompt": "Create login page at app/login/page.tsx, then:
1. Verify the page loads at http://localhost:3000/login
2. Check for console errors
3. Take a screenshot
4. Report findings"}' | \
  /Users/beihuang/.opencode/bin/opencode --model opencode/kimi-k2.5-free
```

## agent-browser 常用命令

| 命令 | 说明 |
|------|------|
| `agent-browser open <url>` | 打开页面 |
| `agent-browser screenshot` | 截图 |
| `agent-browser click <sel>` | 点击元素 |
| `agent-browser type <sel> <text>` | 输入文本 |
| `agent-browser console --level error` | 检查控制台错误 |
| `agent-browser eval <js>` | 执行 JS |
| `agent-browser wait <ms>` | 等待 |
| `agent-browser is_visible <sel>` | 检查元素可见 |

## 完整测试脚本

```bash
#!/bin/bash
# test-web.sh - Kimi 2.5 + agent-browser 集成测试

URL="http://localhost:3000"
TEST_PAGE="/login"

echo "🌐 Web 集成测试"
echo "================"

# 1. 检查服务器
echo "1. 检查开发服务器..."
if curl -s "$URL" > /dev/null; then
    echo "   ✅ 服务器运行中"
else
    echo "   ❌ 服务器未运行，请先执行: npm run dev"
    exit 1
fi

# 2. 打开页面
echo "2. 打开测试页面..."
agent-browser open "$URL$TEST_PAGE"
agent-browser wait 2000

# 3. 截图
echo "3. 截图保存..."
agent-browser screenshot --path "test-screenshot.png"
echo "   📁 保存到: test-screenshot.png"

# 4. 检查控制台错误
echo "4. 检查控制台错误..."
ERRORS=$(agent-browser console --level error --json 2>/dev/null | grep -c "error" || echo "0")
if [ "$ERRORS" = "0" ]; then
    echo "   ✅ 无控制台错误"
else
    echo "   ⚠️ 发现 $ERRORS 个错误"
fi

# 5. 检查页面元素
echo "5. 检查页面元素..."
agent-browser is_visible "body" && echo "   ✅ 页面主体可见"

echo ""
echo "🎉 测试完成"
```

## Kimi 2.5 测试 prompt 模板

```prompt
完成以下任务并验证:

1. 创建/修改代码: <具体任务>
2. 等待服务器热更新 (2-3秒)
3. 打开页面: http://localhost:3000/<路径>
4. 执行测试:
   - 截图保存到 /tmp/test.png
   - 检查控制台错误
   - 验证关键元素可见
5. 报告:
   - 页面是否正常加载
   - 是否有控制台错误
   - UI 是否符合预期
   - 发现的问题

当前目录: /Users/beihuang/Documents/github/aimarketing
```

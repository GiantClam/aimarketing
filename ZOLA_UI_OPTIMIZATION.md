# UI Optimization Guide: Zola UI Reference

> 基于 Zola (prompt-kit + motion-primitives) 最佳实践，对当前项目 UI/UX 进行优化建议。
> 保持现有主题（黄绿配色）不变，针对消息展示、对话框、会话列表、事件呈现等交互层面进行规范。

---

## 一、Zola UI 规范提炼

### 1.1 核心组件架构

Zola 采用分层组件架构：

```
┌─────────────────────────────────────────────────────────┐
│                    ChatContainer                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │  StickToBottom (use-stick-to-bottom)            │   │
│  │  ┌─────────────────────────────────────────┐    │   │
│  │  │  Message (role=assistant/user)           │    │   │
│  │  │  ├── Avatar (with fallback)             │    │   │
│  │  │  ├── MessageContent (markdown/plain)    │    │   │
│  │  │  │   ├── CodeBlock (Shiki highlighting) │    │   │
│  │  │  │   └── ButtonCopy (TextMorph动画)     │    │   │
│  │  │  └── MessageActions (Tooltip)            │    │   │
│  │  └─────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ScrollButton (回到底部)                          │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  PromptInput (rounded-3xl)                      │   │
│  │  ├── Autosize Textarea                          │   │
│  │  └── PromptInputActions (Tooltip)               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 1.2 设计 Token 规范

#### 消息气泡
| Token | Light Mode | Dark Mode | 用途 |
|-------|-----------|-----------|------|
| `bg-secondary` | 消息背景 | 消息背景 | assistant 消息 |
| `bg-primary` | 用户消息背景 | 用户消息背景 | user 消息 |
| `rounded-3xl` | 圆角 | 圆角 | 气泡圆角 |
| `p-2` | 内边距 | 内边距 | 消息内容 |

#### 字体
- **正文**: system-ui, -apple-system, sans-serif
- **代码**: `font-mono`, `text-sm`
- **消息内容**: `prose break-words whitespace-normal`

#### 间距
- 消息间距: `gap-3` (12px)
- 气泡内边距: `p-2`
- 头像尺寸: `h-8 w-8` (32px)

### 1.3 动画规范

#### Typing Indicator (三点跳动)
```typescript
// 动画参数
const DOT_SIZE = "size-2"        // 8px 圆点
const ANIMATION_DURATION = 0.6   // 600ms
const DELAY = [0, 0.1, 0.2]      // 错开延迟
const ANIMATION = {
  y: ["0%", "-60%", "0%"],       // 上下弹跳
  opacity: [1, 0.7, 1]           // 透明度变化
}
```

#### 滚动按钮过渡
```typescript
// 显示/隐藏动画
const SHOW = "translate-y-0 scale-100 opacity-100"
const HIDE = "translate-y-4 scale-95 opacity-0"
transition: "all duration-150 ease-out"
```

#### TextMorph (复制按钮)
- 状态切换: "Copy" → "Copied"
- 动画: 文字平滑变形
- 自动隐藏: 1000ms 后恢复

### 1.4 交互规范

#### Prompt Input
- 容器: `border-input bg-background rounded-3xl border p-2 shadow-xs`
- Textarea: `min-h-[44px] resize-none border-none bg-transparent`
- 发送键: `rounded-full`
- 最大高度: `240px`

#### 代码块
- 边框: `border-border rounded-xl bg-card`
- 语言标签: `text-muted-foreground font-mono text-xs`
- 复制按钮: 悬停时 `opacity-100`，否则 `opacity-0`

#### ScrollArea
- 滚动条: `w-2.5 border-l border-l-transparent`
- 滑块: `bg-border rounded-full`
- Focus ring: `ring-ring/10 dark:ring-ring/20`

---

## 二、当前项目 UI 现状分析

### 2.1 现有组件位置

| 组件 | 路径 | 状态 |
|-----|------|------|
| `DifyChatArea` | `components/chat/DifyChatArea.tsx` | 主聊天组件 |
| `WorkspaceMessageFrame` | `components/workspace/workspace-message-primitives.tsx` | 消息框架 |
| `WorkspaceLoadingMessage` | `components/workspace/workspace-message-primitives.tsx` | 加载骨架 |
| `CodeBlock` | `components/chat/CodeBlock.tsx` | 代码块(Prism) |
| `WorkspaceComposerPanel` | `components/workspace/workspace-primitives.tsx` | 输入面板 |
| `WorkspaceEmptyState` | `components/workspace/workspace-primitives.tsx` | 空状态 |

### 2.2 差距分析

#### 消息展示
| 特性 | Zola | 当前项目 | 差距 |
|-----|------|---------|------|
| 头像 Avatar | ✅ Avatar 组件 | ⚠️ 简单图标 | 需要升级 |
| Markdown 渲染 | ✅ react-markdown + remarkGfm | ✅ 已有 | - |
| 代码高亮 | ✅ Shiki (主题敏感) | ⚠️ Prism oneDark | 需要升级 |
| 消息操作 | ✅ Tooltip + TextMorph | ⚠️ 简单按钮 | 需要升级 |
| 复制反馈 | ✅ TextMorph 动画 | ⚠️ 简单状态切换 | 需要升级 |

#### 加载状态
| 特性 | Zola | 当前项目 | 差距 |
|-----|------|---------|------|
| Typing Indicator | ✅ 三点跳动动画 | ❌ 静态 spinner | 需新增 |
| 骨架屏 | ✅ WorkspaceConversationSkeleton | ✅ 已有 | - |
| 进度反馈 | ⚠️ 简单文字 | ❌ 无 | 需新增 |

#### 对话框
| 特性 | Zola | 当前项目 | 差距 |
|-----|------|---------|------|
| MorphingDialog | ✅ 变形动画 | ❌ 无 | 需新增 |
| AlertDialog | ✅ shadcn AlertDialog | ✅ 已有 | - |
| Drawer | ✅ shadcn Drawer | ✅ 已有 | - |

#### 滚动交互
| 特性 | Zola | 当前项目 | 差距 |
|-----|------|---------|------|
| 滚动到底部按钮 | ✅ ScrollButton | ❌ 无 | 需新增 |
| 自动滚动 | ✅ use-stick-to-bottom | ⚠️ 手动 scrollIntoView | 需升级 |
| 滚动锚点 | ✅ scroll-mt-4 | ❌ 无 | 需新增 |

#### 设置面板
| 特性 | Zola | 当前项目 | 差距 |
|-----|------|---------|------|
| 响应式标签 | ✅ Desktop侧边/移动端顶部 | ❌ 简单tabs | 需升级 |
| 面板内容组织 | ✅ 分组清晰 | ⚠️ 需改进 | - |

---

## 三、优化建议（保持主题不变）

### 3.1 高优先级优化

#### P0-1: 添加 Typing Indicator 动画

当前: `Loader2 animate-spin` 静态旋转

**优化为** (参考 `zola/components/prompt-kit/loader.tsx`):

```tsx
// components/ui/typing-indicator.tsx
"use client"

import { motion } from "framer-motion"

const DOT_SIZE = "size-2"
const DOT_COLOR = "bg-primary/60"

export function TypingIndicator() {
  return (
    <div className="flex items-center justify-center gap-1">
      <Dot delay={0} />
      <Dot delay={0.1} />
      <Dot delay={0.2} />
    </div>
  )
}

function Dot({ delay }: { delay: number }) {
  return (
    <motion.div
      className={`${DOT_SIZE} ${DOT_COLOR} rounded-full`}
      animate={{ y: ["0%", "-60%", "0%"], opacity: [1, 0.7, 1] }}
      transition={{ duration: 0.6, ease: "easeInOut", repeat: Infinity, delay }}
    />
  )
}
```

**使用位置**: `DifyChatArea.tsx` 第 456 行

#### P0-2: 添加滚动到底部按钮

当前: 无

**新增** (参考 `zola/components/prompt-kit/scroll-button.tsx`):

```tsx
// components/ui/scroll-button.tsx
"use client"

import { Button } from "@/components/ui/button"
import { useStickToBottomContext } from "use-stick-to-bottom"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function ScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        "h-10 w-10 rounded-full transition-all duration-150 ease-out",
        !isAtBottom
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-4 scale-95 opacity-0"
      )}
      onClick={() => scrollToBottom()}
    >
      <ChevronDown className="h-5 w-5" />
    </Button>
  )
}
```

#### P0-3: 代码块升级为 Shiki 语法高亮

当前: Prism with oneDark (不支持主题切换)

**优化为** (参考 `zola/components/prompt-kit/code-block.tsx`):

```tsx
// components/chat/CodeBlock.tsx 升级
"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

function CodeBlockCode({ code, language = "tsx" }) {
  const { resolvedTheme } = useTheme()
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    async function highlight() {
      const html = await codeToHtml(code, {
        lang: language,
        theme: resolvedTheme === "dark" ? "github-dark" : "github-light",
      })
      setHighlightedHtml(html)
    }
    highlight()
  }, [code, language, resolvedTheme])

  return highlightedHtml ? (
    <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
  ) : (
    <pre><code>{code}</code></pre>
  )
}
```

### 3.2 中优先级优化

#### P1-1: 消息操作按钮添加 Tooltip

当前: 简单文本按钮

**优化为** (参考 `zola/components/prompt-kit/message.tsx`):

```tsx
// 在 WorkspaceMessageFrame 的 action 中使用 Tooltip
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

<MessageAction tooltip="复制回复">
  <button onClick={handleCopy}>
    <Copy className="h-3 w-3" />
  </button>
</MessageAction>
```

#### P1-2: 复制按钮添加 TextMorph 动画

当前: 简单状态切换

**新增** (参考 `zola/components/common/button-copy.tsx`):

```tsx
// components/ui/text-morph.tsx (从 motion-primitives)
"use client"

import { motion, MotionConfig } from "motion/react"

export function TextMorph({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig>
      <motion.span>
        {children}
      </motion.span>
    </MotionConfig>
  )
}
```

#### P1-3: 消息内容 Markdown 样式优化

当前: 内联样式分散

**优化为** (参考 `zola/components/prompt-kit/markdown.tsx`):

```tsx
// 统一 Markdown 样式类
const markdownStyles = `
  prose break-words whitespace-normal
  prose-headings:text-base prose-headings:font-semibold
  prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0
  prose-code:bg-accent prose-code:rounded prose-code:px-1.5 prose-code:py-0.5
  prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:p-3
`
```

### 3.3 低优先级优化

#### P2-1: ScrollArea 样式增强

参考 `zola/components/ui/scroll-area.tsx` 增强 focus ring

#### P2-2: 设置面板响应式优化

参考 `zola-reference/app/components/layout/settings/settings-content.tsx`:
- Desktop: TabsList 垂直排列在左侧
- Mobile: TabsList 水平排列在顶部，使用 Drawer

#### P2-3: 添加 ProgressiveBlur 效果

参考 `zola-reference/components/motion-primitives/progressive-blur.tsx`:
- 用于消息列表顶部渐变遮罩
- 提供视觉深度感

---

## 四、建议组件库引入

### 4.1 必须引入

| 包 | 用途 | 安装命令 |
|----|------|---------|
| `use-stick-to-bottom` | 聊天自动滚动 | `npm i use-stick-to-bottom` |
| `motion` (motion-primitives) | 动画效果 | `npm i motion` |

### 4.2 可选引入 (如果需要完整 Zola 体验)

| 包 | 用途 |
|----|------|
| `@phosphor-icons/react` | 图标 (Zola 使用) |
| `shiki` | 代码语法高亮 |

---

## 五、实施路线图

### Phase 1: 消息展示优化 (1-2天)
- [ ] 新增 `TypingIndicator` 组件
- [ ] 升级 `CodeBlock` 为 Shiki 高亮
- [ ] 添加 `ScrollButton` 组件
- [ ] 消息操作按钮添加 Tooltip

### Phase 2: 动画增强 (1天)
- [ ] 添加 TextMorph 复制按钮
- [ ] 消息列表添加 use-stick-to-bottom
- [ ] 优化加载状态过渡

### Phase 3: 设置面板优化 (1天)
- [ ] 响应式设置面板
- [ ] 添加 MorphingDialog (可选)

---

## 六、参考文件

- **Zola 完整组件**: `zola-reference/components/`
- **Prompt Kit**: https://prompt-kit.com/
- **Motion Primitives**: https://motion-primitives.com/
- **Shadcn UI**: https://ui.shadcn.com/

---

## 附录: Zola UI 截取的关键代码模式

### A. 消息组件组合
```tsx
<Message>
  <MessageAvatar src={avatar} alt="AI" fallback="AI" />
  <div className="flex-1">
    <MessageContent markdown>
      {content}
    </MessageContent>
    <MessageActions>
      <MessageAction tooltip="复制">
        <ButtonCopy />
      </MessageAction>
    </MessageActions>
  </div>
</Message>
```

### B. 聊天容器
```tsx
<ChatContainerRoot>
  <ChatContainerContent>
    {messages.map(msg => <Message key={msg.id} {...msg} />)}
  </ChatContainerContent>
  <ScrollAnchor />
</ChatContainerRoot>
<ScrollButton />
```

### C. Prompt Input
```tsx
<PromptInput value={value} onValueChange={setValue} onSubmit={handleSubmit}>
  <PromptInputTextarea disableAutosize={isLoading} />
  <PromptInputActions>
    <PromptInputAction tooltip="发送">
      <SendButton />
    </PromptInputAction>
  </PromptInputActions>
</PromptInput>
```

---

*文档版本: 2026-04-02*
*参考: Zola (ibelick/zola) - prompt-kit + motion-primitives*

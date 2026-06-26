"use client"

import { useEffect, useRef, useState } from "react"
import { Bot } from "lucide-react"
import { PageAgent } from "page-agent"

import { Button } from "@/components/ui/button"
import {
  getBuilderAgentInstructions,
  getBuilderAgentPageInstructions,
  inferAgentLocale,
} from "@/lib/page-agent/instructions"

// Attributes the agent relies on. `includeAttributes` ensures page-agent's DOM
// simplifier keeps these in the text it sends to the LLM, so the agent can
// target the affordances we added across the dashboard.
const AGENT_INCLUDE_ATTRIBUTES = [
  "data-agent-add-node",
  "data-agent-toggle-library",
  "data-agent-save",
  "data-agent-run",
  "data-agent-new-workflow",
  "data-agent-node",
  "data-agent-node-connect",
  "data-agent-node-connect-source",
  "data-agent-node-connect-target",
  "data-agent-output-port",
  "data-agent-input-port",
  "data-agent-config",
  "data-agent-nav",
]

const FIRST_VISIT_KEY = "aimarketing_pa_seen"
const PANEL_ID = "page-agent-runtime_agent-panel"
const PANEL_OPEN_ATTR = "data-page-agent-panel-open"

// Renders the floating assistant button present on every authenticated
// dashboard page. The button is the only always-visible chrome; page-agent's
// own Panel (input + run/stop + history) is created lazily and shown on click.
// LLM calls go through /api/ai/agent-proxy (same-origin, session-cookie auth)
// so no provider key is exposed to the browser. Mounted via next/dynamic with
// ssr:false because page-agent touches window/document.
export function PageAgentWidget() {
  const agentRef = useRef<PageAgent | null>(null)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const syncPanelLayoutState = () => {
      document.body.toggleAttribute(PANEL_OPEN_ATTR, Boolean(document.getElementById(PANEL_ID)))
    }

    // page-agent's Panel mounts to <body> with its own centered positioning.
    // Re-anchor it to the right edge and reserve a right-side gutter on large
    // screens so the panel sits beside the workspace instead of covering it.
    const style = document.createElement("style")
    style.textContent = `
      :root {
        --page-agent-panel-width: 360px;
        --page-agent-panel-gap: 16px;
        --page-agent-panel-reserved-space: calc(var(--page-agent-panel-width) + var(--page-agent-panel-gap) * 2);
      }

      .dashboard-shell {
        transition: padding-right 0.3s ease-in-out;
      }

      #page-agent-runtime_agent-panel {
        right: var(--page-agent-panel-gap) !important;
        left: auto !important;
        bottom: 76px !important;
        top: auto !important;
        transform: none !important;
        width: var(--page-agent-panel-width) !important;
        max-height: calc(100vh - 96px) !important;
      }

      @media (min-width: 1280px) {
        body[data-page-agent-panel-open="true"] .dashboard-shell {
          padding-right: var(--page-agent-panel-reserved-space) !important;
        }
      }
    `
    document.head.appendChild(style)

    syncPanelLayoutState()
    const observer = new MutationObserver(syncPanelLayoutState)
    observer.observe(document.body, { childList: true })

    try {
      if (!window.localStorage.getItem(FIRST_VISIT_KEY)) {
        setPulse(true)
        window.localStorage.setItem(FIRST_VISIT_KEY, "1")
      }
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
    return () => {
      observer.disconnect()
      document.body.removeAttribute(PANEL_OPEN_ATTR)
      style.remove()
      agentRef.current?.dispose()
      agentRef.current = null
    }
  }, [])

  const openPanel = () => {
    if (typeof window === "undefined") return
    setPulse(false)

    // page-agent's Panel "close" disposes the agent, so recreate it when the
    // user reopens the assistant.
    let agent = agentRef.current
    if (!agent || agent.disposed) {
      const locale = inferAgentLocale()
      agent = new PageAgent({
        baseURL: "/api/ai/agent-proxy",
        // The proxy overrides the model server-side with the active provider's
        // configured model, so this value is only a placeholder.
        model: "aimarketing-routed",
        apiKey: "aimarketing-session",
        // Force the session cookie to be sent on the same-origin proxy call.
        // Provider-specific request tweaks (model override, tool_choice shape)
        // are handled server-side in /api/ai/agent-proxy so they can differ per
        // provider (e.g. pptoken wants flat tool_choice, DeepSeek wants nested).
        customFetch: ((input: string | URL | Request, init?: RequestInit) =>
          fetch(input, { ...init, credentials: "same-origin" })) as typeof fetch,
        language: locale === "zh" ? "zh-CN" : "en-US",
        maxSteps: 60,
        stepDelay: 0.3,
        includeAttributes: AGENT_INCLUDE_ATTRIBUTES,
        instructions: {
          system: getBuilderAgentInstructions(locale),
          getPageInstructions: (url: string) => getBuilderAgentPageInstructions(url, locale),
        },
        // Never let the agent execute generated JavaScript on the page.
        experimentalScriptExecutionTool: false,
      })
      agentRef.current = agent
    }

    try {
      agent.panel.show()
      agent.panel.expand()
    } catch {
      // Panel show/expand is best-effort; ignore if the DOM isn't ready.
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      onClick={openPanel}
      aria-label={inferAgentLocale() === "zh" ? "AI 助手" : "AI assistant"}
      title={inferAgentLocale() === "zh" ? "AI 助手" : "AI assistant"}
      className={
        "fixed bottom-4 right-4 z-50 size-12 rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(15,23,42,0.28)] transition hover:bg-primary/90" +
        (pulse ? " animate-pulse" : "")
      }
      data-page-agent-ignore="true"
    >
      <Bot className="h-5 w-5" />
    </Button>
  )
}

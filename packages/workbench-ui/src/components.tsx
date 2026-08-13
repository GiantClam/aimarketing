import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type WorkbenchMessageRole = "assistant" | "user" | "system";

function workbenchLocale() {
  return typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

export type WorkbenchMessageFrameProps = {
  role: WorkbenchMessageRole;
  label?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** Shared message frame used by the online dashboard and the Tauri adapter. */
export function WorkbenchMessageFrame({ role, label, icon, action, children, className = "", bodyClassName = "" }: WorkbenchMessageFrameProps) {
  const isUser = role === "user";
  const avatar = icon ?? <span className="wb-message-avatar-label">{isUser ? "U" : "AI"}</span>;
  return (
    <div className={`wb-message-frame wb-message-${role} ${className}`.trim()} data-cloud-surface="message">
      <div className="wb-message-inner">
        <div className="wb-message-avatar">{avatar}</div>
        <div className="wb-message-content">
          {(label || action) ? <div className="wb-message-header"><div className="wb-message-label">{label}</div>{action}</div> : null}
          <div className={`wb-message-body ${bodyClassName}`.trim()}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export type WorkbenchTaskEvent = { type: string; label: string; detail?: string; status?: "queued" | "info" | "running" | "completed" | "failed" };

export function WorkbenchTaskEvents({ events, limit = 4, className = "" }: { events: WorkbenchTaskEvent[]; limit?: number; className?: string }) {
  const recent = events.slice(-Math.max(1, limit));
  if (!recent.length) return null;
  return (
    <div className={`wb-message-events ${className}`.trim()} data-testid="workspace-task-events">
      {recent.map((event, index) => <div className="wb-message-event" key={`${event.type}-${index}`}><span className={`wb-event-dot wb-event-${event.status ?? "queued"}`} /> <span>{event.label}{event.detail ? <span className="wb-event-detail">{event.detail}</span> : null}</span></div>)}
    </div>
  );
}

/**
 * Host-neutral cloud message frame. Hosts keep ownership of rich message
 * parts and artifact actions, while the shared package owns the common
 * dashboard geometry used by SaaS and desktop.
 */
export function WorkbenchCloudMessageShell({
  role,
  label,
  timestamp,
  children,
  attachments,
  footer,
  className = "",
}: {
  role: "assistant" | "user";
  label: string;
  timestamp: ReactNode;
  children: ReactNode;
  attachments?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  if (role === "user") {
    return (
      <div className={`wb-cloud-message wb-cloud-message-user ${className}`.trim()} data-cloud-surface="message">
        <div className="message-card-user">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="dashboard-kicker text-primary">{label}</div>
            <div className="text-xs text-white/55">{timestamp}</div>
          </div>
          {children}
          {attachments}
        </div>
        <div className="ai-avatar wb-chat-user-avatar" aria-label={label}>U</div>
      </div>
    );
  }
  return (
    <div className={`wb-cloud-message wb-cloud-message-assistant ${className}`.trim()} data-cloud-surface="message">
      <div className="ai-avatar mt-1 shrink-0">AI</div>
      <article className="message-card assistant-message">
        <div className="message-header assistant-message-header">
          <div className="min-w-0 flex-1">
            <div className="dashboard-kicker text-foreground">{label}</div>
            <div className="message-time">{timestamp}</div>
          </div>
        </div>
        {children}
        {footer}
      </article>
    </div>
  );
}

/** Shared Markdown body so desktop and cloud render the same authored content. */
function WorkbenchMessageMarkdown({ content, className = "" }: { content: string; className?: string }) {
  return <div className={className}><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
}

/**
 * Cloud AI-entry compatible message card used by the Tauri adapter.
 * Keep the DOM/class contract aligned with components/ai-entry/ai-entry-workspace.tsx
 * so both surfaces share the same avatar, bubble and timestamp geometry.
 */
export function WorkbenchChatMessage({
  role,
  content,
  label,
  timestamp = new Date(),
  pending = false,
  events = [],
  artifacts = [],
  onArtifactOpen,
  attachments = [],
}: {
  role: "assistant" | "user";
  content: string;
  label?: string;
  timestamp?: Date | string;
  pending?: boolean;
  events?: WorkbenchTaskEvent[];
  artifacts?: Array<{ id: string; title: string; relativePath: string; mimeType: string; byteLength?: number }>;
  onArtifactOpen?: (relativePath: string, mimeType: string) => void;
  attachments?: Array<{ id: string; name: string; mediaType?: string }>;
}) {
  const locale = workbenchLocale();
  const copy = locale === "en" ? { user: "Your prompt", response: "AI RESPONSE", copy: "Copy reply", pending: "Generating…", artifacts: "Generated artifacts" } : { user: "你的指令", response: "AI RESPONSE", copy: "复制回复", pending: "正在生成…", artifacts: "生成产物" };
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const copyReply = async (button: HTMLButtonElement) => {
    if (!content) return;
    try {
      await globalThis.navigator?.clipboard?.writeText(content);
      const original = button.textContent;
      button.textContent = "✓";
      globalThis.setTimeout(() => { button.textContent = original; }, 1400);
    } catch {
      button.textContent = "!";
    }
  };
  if (role === "user") {
    return (
      <div className="wb-cloud-message wb-cloud-message-user" data-cloud-surface="message">
        <div className="message-card-user">
          <div className="message-header">
            <div className="dashboard-kicker text-primary">{label ?? copy.user}</div>
            <div className="text-xs text-white/55">{time}</div>
          </div>
          <WorkbenchMessageMarkdown className="message-body wb-chat-user-body" content={content} />
          {attachments.length ? <div className="wb-message-attachments">{attachments.map((attachment) => <span key={attachment.id} className="wb-message-attachment"><span aria-hidden="true">{attachment.mediaType?.startsWith("image/") ? "▧" : "⌕"}</span>{attachment.name}</span>)}</div> : null}
        </div>
        <div className="ai-avatar wb-chat-user-avatar">U</div>
      </div>
    );
  }
  return (
    <div className="wb-cloud-message wb-cloud-message-assistant" data-cloud-surface="message">
      <div className="ai-avatar">AI</div>
      <article className="message-card assistant-message">
        <div className="message-header assistant-message-header">
          <div className="min-w-0 flex-1">
            <div className="dashboard-kicker text-foreground">{label ?? copy.response}</div>
            <div className="message-time">{time}</div>
          </div>
          {content ? <div className="message-actions message-feedback"><button type="button" className="message-feedback-btn" onClick={(event) => void copyReply(event.currentTarget)} aria-label={copy.copy} title={copy.copy}>⧉</button></div> : null}
        </div>
        {pending ? <div className="wb-chat-pending"><span className="wb-chat-pending-dot" />{copy.pending}</div> : content ? <WorkbenchMessageMarkdown className="message-body assistant-body" content={content} /> : null}
        {events.length ? <div className="assistant-live-panel"><WorkbenchTaskEvents events={events} limit={4} className="pl-0" /></div> : null}
        {artifacts.length ? <section className="wb-artifact-section"><div className="wb-artifact-title">✦ {copy.artifacts}</div><div className="wb-artifact-grid">{artifacts.map((artifact) => <button key={artifact.id} type="button" className="wb-artifact-card" onClick={() => onArtifactOpen?.(artifact.relativePath, artifact.mimeType)}><span className="wb-artifact-name">{artifact.title || artifact.relativePath}</span><small>{artifact.mimeType}{typeof artifact.byteLength === "number" ? ` · ${Math.ceil(artifact.byteLength / 1024)} KB` : ""}</small></button>)}</div></section> : null}
      </article>
    </div>
  );
}

/** Writer-specific message shell matching the online Writer workspace frame. */
export function WorkbenchWriterMessage({ role, label, content, timestamp, pending = false, events = [], artifacts = [], onArtifactOpen, attachments = [] }: { role: "assistant" | "user"; label: string; content: string; timestamp?: Date | string; pending?: boolean; events?: WorkbenchTaskEvent[]; artifacts?: Array<{ id: string; title: string; relativePath: string; mimeType: string; byteLength?: number }>; onArtifactOpen?: (relativePath: string, mimeType: string) => void; attachments?: Array<{ id: string; name: string; mediaType?: string }> }) {
  const locale = workbenchLocale();
  const time = new Date(timestamp ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const copy = locale === "en" ? { pending: "Generating…", artifacts: "Generated artifacts" } : { pending: "正在生成…", artifacts: "生成产物" };
  return (
    <WorkbenchMessageFrame
      role={role}
      label={label}
      icon={role === "assistant" ? <span className="wb-writer-avatar-mark" aria-hidden="true">✦</span> : undefined}
      className={`wb-writer-message wb-writer-message-${role}`}
    >
      <div className={`wb-writer-message-bubble wb-writer-message-bubble-${role}`}>
        <div className="wb-writer-message-time">{time}</div>
        {pending ? <div className="wb-chat-pending"><span className="wb-chat-pending-dot" />{copy.pending}</div> : content ? <WorkbenchMessageMarkdown className="wb-writer-message-markdown" content={content} /> : null}
        {attachments.length ? <div className="wb-message-attachments">{attachments.map((attachment) => <span key={attachment.id} className="wb-message-attachment"><span aria-hidden="true">{attachment.mediaType?.startsWith("image/") ? "▧" : "⌕"}</span>{attachment.name}</span>)}</div> : null}
        {events.length ? <div className="wb-writer-message-events"><WorkbenchTaskEvents events={events} limit={4} /></div> : null}
        {artifacts.length ? <section className="wb-artifact-section"><div className="wb-artifact-title">✦ {copy.artifacts}</div><div className="wb-artifact-grid">{artifacts.map((artifact) => <button key={artifact.id} type="button" className="wb-artifact-card" onClick={() => onArtifactOpen?.(artifact.relativePath, artifact.mimeType)}><span className="wb-artifact-name">{artifact.title || artifact.relativePath}</span><small>{artifact.mimeType}{typeof artifact.byteLength === "number" ? ` · ${Math.ceil(artifact.byteLength / 1024)} KB` : ""}</small></button>)}</div></section> : null}
      </div>
    </WorkbenchMessageFrame>
  );
}

export type WorkbenchShellNavItem = { path: string; label: string; section?: string; glyph?: string; icon?: ReactNode; placement?: "main" | "footer" | "hidden" };

export function WorkbenchShellFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`wb-shell-frame ${className}`.trim()}>{children}</div>;
}

export function WorkbenchShell({
  navItems,
  activePath,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  locale: shellLocale,
  onLocaleChange,
  onLocaleToggle,
  children,
  title = "MARKETING",
  localLabel = "本地工作区 · Full Access",
  status = "",
}: {
  navItems: WorkbenchShellNavItem[];
  activePath: string;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  locale?: "zh" | "en";
  onLocaleChange?: (locale: "zh" | "en") => void;
  onLocaleToggle?: () => void;
  children: ReactNode;
  title?: string;
  localLabel?: string;
  status?: ReactNode;
}) {
  const locale = shellLocale ?? workbenchLocale();
  const toggleCopy = locale === "en" ? { navigation: "Workspace navigation", expand: "Expand sidebar", collapse: "Collapse sidebar" } : { navigation: "工作区导航", expand: "展开侧栏", collapse: "收起侧栏" };
  const visibleNavItems = navItems.filter((item) => item.placement !== "hidden");
  const mainNavItems = visibleNavItems.filter((item) => item.placement !== "footer");
  const footerNavItems = navItems.filter((item) => item.placement === "footer");
  // Query-string Agent routes must win over their base `/dashboard/ai` item.
  // The cloud sidebar highlights the exact Agent entry, not both entries.
  const hasExactActiveRoute = navItems.some((item) => item.path === activePath);
  let lastSection: string | undefined;
  return (
    <WorkbenchShellFrame className={`wb-shell ${collapsed ? "wb-shell-collapsed" : ""}`.trim()}>
      <aside className="wb-sidebar">
        <div className="wb-sidebar-head">
          <div className="wb-sidebar-brand"><span className="wb-brand-mark">AI</span>{!collapsed ? <span className="wb-brand-title">{title}</span> : null}</div>
          <div className={`wb-sidebar-toolbar ${collapsed ? "wb-sidebar-toolbar-collapsed" : ""}`.trim()}>
            {(onLocaleChange || onLocaleToggle) ? <div className="wb-locale-switcher" role="group" aria-label={locale === "zh" ? "界面语言" : "Interface language"}>{!collapsed ? <span className="wb-locale-globe" aria-hidden="true">◉</span> : null}<button type="button" className={`wb-locale-option ${locale === "zh" ? "is-active" : ""}`.trim()} onClick={() => onLocaleChange ? onLocaleChange("zh") : (locale === "zh" ? undefined : onLocaleToggle?.())} aria-pressed={locale === "zh"} aria-label={locale === "zh" ? "切换到中文" : "Switch to Chinese"} title={locale === "zh" ? "切换到中文" : "Switch to Chinese"}>{collapsed ? "中" : "中文"}</button><button type="button" className={`wb-locale-option ${locale === "en" ? "is-active" : ""}`.trim()} onClick={() => onLocaleChange ? onLocaleChange("en") : (locale === "en" ? undefined : onLocaleToggle?.())} aria-pressed={locale === "en"} aria-label={locale === "en" ? "Switch to English" : "切换到英文"} title={locale === "en" ? "Switch to English" : "切换到英文"}>EN</button></div> : null}
            <button type="button" className="wb-sidebar-toggle" aria-label={collapsed ? toggleCopy.expand : toggleCopy.collapse} title={collapsed ? toggleCopy.expand : toggleCopy.collapse} onClick={onToggleCollapsed}><span className="wb-sidebar-toggle-icon" aria-hidden="true">{collapsed ? "›" : "‹"}</span></button>
          </div>
        </div>
        <nav className="wb-sidebar-nav" aria-label={toggleCopy.navigation}>
            {mainNavItems.map((item) => {
              const itemBasePath = item.path.split("?")[0];
              const activeBasePath = activePath.split("?")[0];
              const isActive = item.path === activePath || (!hasExactActiveRoute && item.path === itemBasePath && (activeBasePath === itemBasePath || activeBasePath.startsWith(`${itemBasePath}/`)));
              const showSection = Boolean(item.section && !collapsed && item.section !== lastSection);
              if (item.section) lastSection = item.section;
              return <div key={item.path}>
            {showSection ? <h3 className="wb-nav-section">{item.section}</h3> : null}
            <button type="button" className={`wb-nav-item ${isActive ? "wb-nav-item-active" : ""}`.trim()} title={item.label} aria-label={item.label} aria-current={isActive ? "page" : undefined} data-agent-nav={item.label} onClick={() => onNavigate(item.path)}><span className="wb-nav-glyph" aria-hidden="true">{item.icon ?? item.glyph ?? item.label.slice(0, 1)}</span>{!collapsed ? <span className="wb-nav-label">{item.label}</span> : null}</button>
          </div>;
            })}
        </nav>
        <div className="wb-sidebar-footer">{footerNavItems.length ? <div className="wb-sidebar-footer-nav">{footerNavItems.map((item) => <button key={item.path} type="button" className={`wb-nav-item ${item.path === activePath ? "wb-nav-item-active" : ""}`.trim()} title={item.label} aria-label={item.label} aria-current={item.path === activePath ? "page" : undefined} data-agent-nav={item.label} onClick={() => onNavigate(item.path)}><span className="wb-nav-glyph" aria-hidden="true">{item.icon ?? item.glyph ?? item.label.slice(0, 1)}</span>{!collapsed ? <span className="wb-nav-label">{item.label}</span> : null}</button>)}</div> : null}{!collapsed && (localLabel || status) ? <div className="wb-status">{localLabel ? <div className="wb-local-label">{localLabel}</div> : null}{status}</div> : null}</div>
      </aside>
      <main className="wb-shell-main">{children}</main>
    </WorkbenchShellFrame>
  );
}

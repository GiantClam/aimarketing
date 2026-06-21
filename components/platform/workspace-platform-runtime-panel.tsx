import { Badge } from "@/components/ui/badge"
import type { PlatformRuntimeSnapshot } from "@/lib/platform/runtime"

function getStatusLabel(value: boolean, locale: "zh" | "en") {
  return value ? (locale === "zh" ? "已启用" : "Enabled") : locale === "zh" ? "未启用" : "Disabled"
}

function getModeLabel(mode: PlatformRuntimeSnapshot["tasks"][number]["mode"], locale: "zh" | "en") {
  const labels =
    locale === "zh"
      ? {
          interactive: "交互式",
          sync: "同步",
          async: "异步队列",
          hybrid: "混合模式",
          deferred: "后续实现",
        }
      : {
          interactive: "Interactive",
          sync: "Synchronous",
          async: "Async queue",
          hybrid: "Hybrid",
          deferred: "Deferred",
        }

  return labels[mode]
}

function getAccessModelLabel(
  value: PlatformRuntimeSnapshot["entitlements"][number]["accessModel"],
  locale: "zh" | "en",
) {
  if (value === "enterprise_admin") {
    return locale === "zh" ? "企业管理员" : "Enterprise admin"
  }

  if (value === "public_then_login") {
    return locale === "zh" ? "公开入口 + 登录升级" : "Public first, login to upgrade"
  }

  return locale === "zh" ? "企业权限控制" : "Enterprise permission gate"
}

export function WorkspacePlatformRuntimePanel({
  locale,
  snapshot,
}: {
  locale: "zh" | "en"
  snapshot: PlatformRuntimeSnapshot
}) {
  const copy =
    locale === "zh"
      ? {
          eyebrow: "Runtime Control Surface",
          title: "Task Runtime / Entitlements",
          description:
            "这里直接读取当前仓库里的真实任务模式和权限钩子，不再重复展示已经并入模型配置 tab 的 Provider Routing。",
          tasks: "Task Runtime",
          entitlements: "Entitlement Hooks",
          runtimeId: "运行时",
          models: "模型 / Runtime",
          statuses: "状态流",
          capabilities: "关联能力",
          generatedAt: "快照时间",
        }
      : {
          eyebrow: "Runtime Control Surface",
          title: "Task Runtime / Entitlements",
          description:
            "This panel reads the real task-mode and entitlement hooks from the current codebase, without duplicating Provider Routing that now lives in the model-config tab.",
          tasks: "Task Runtime",
          entitlements: "Entitlement Hooks",
          runtimeId: "Runtime",
          models: "Model / Runtime",
          statuses: "Statuses",
          capabilities: "Capabilities",
          generatedAt: "Snapshot",
        }

  return (
    <section className="public-grid-bg workspace-page-shell-bottom mx-auto max-w-7xl">
      <div className="workspace-stack">
        <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
          <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
              {copy.generatedAt}: {snapshot.generatedAt}
            </span>
            <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
              {copy.tasks}: {snapshot.tasks.length}
            </span>
            <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
              {copy.entitlements}: {snapshot.entitlements.length}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="dashboard-kicker text-muted-foreground">{copy.tasks}</div>
          <div className="grid gap-4 xl:grid-cols-2">
            {snapshot.tasks.map((task) => (
              <article key={task.id} className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="dashboard-kicker text-muted-foreground">{task.capabilitySlug}</div>
                    <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {task.title}
                    </h3>
                  </div>
                  <Badge variant="outline" className="rounded-[4px] border-primary/30 bg-background/70 font-display text-[11px] uppercase tracking-[0.08em]">
                    {getModeLabel(task.mode, locale)}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2 text-sm leading-7 text-muted-foreground">
                  <div>
                    <strong className="text-foreground">{copy.runtimeId}:</strong> {task.runtimeId}
                  </div>
                  <div>
                    <strong className="text-foreground">{copy.statuses}:</strong> {task.statuses.join(" / ")}
                  </div>
                  <div>
                    <strong className="text-foreground">{locale === "zh" ? "启用状态" : "Enabled"}:</strong> {getStatusLabel(task.enabled, locale)}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {task.notes.map((note) => (
                    <div key={note} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                      {note}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="dashboard-kicker text-muted-foreground">{copy.entitlements}</div>
          <div className="grid gap-4 xl:grid-cols-2">
            {snapshot.entitlements.map((item) => (
              <article key={item.feature} className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="dashboard-kicker text-muted-foreground">{getAccessModelLabel(item.accessModel, locale)}</div>
                    <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {item.feature}
                    </h3>
                  </div>
                  <Badge variant="outline" className="rounded-[4px] border-primary/30 bg-background/70 font-display text-[11px] uppercase tracking-[0.08em]">
                    {getStatusLabel(item.runtimeEnabled, locale)}
                  </Badge>
                </div>

                <div className="mt-4 text-sm leading-7 text-muted-foreground">
                  <strong className="text-foreground">{copy.capabilities}:</strong> {item.capabilitySlugs.join(", ")}
                </div>

                <div className="mt-4 space-y-2">
                  {item.notes.map((note) => (
                    <div key={note} className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">
                      {note}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

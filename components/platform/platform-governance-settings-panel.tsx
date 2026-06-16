"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { AppLocale } from "@/lib/i18n/config"
import type {
  CustomerGovernanceSettings,
  CustomerGovernanceSnapshot,
} from "@/lib/platform/customer-governance"
import {
  getSupportedModelCards,
  type EnterpriseModelCategory,
  type EnterpriseModelCategoryConfig,
  type EnterpriseModelProviderId,
} from "@/lib/platform/model-config"

type Copy = {
  title: string
  body: string
  ssoDomain: string
  ssoDomainPlaceholder: string
  seatRequestNote: string
  seatRequestPlaceholder: string
  runtimeIntakeMode: string
  runtimeDefault: string
  runtimeReview: string
  save: string
  saving: string
  saved: string
  saveFailed: string
  readOnly: string
  modelSectionTitle: string
  modelSectionBody: string
  categoryTabs: Record<EnterpriseModelCategory, string>
  categoryDescriptions: Record<EnterpriseModelCategory, string>
  supportedModels: string
  selectedProvider: string
  selectedModel: string
  selectedModelPlaceholder: string
  providerLabel: string
  baseUrl: string
  baseUrlPlaceholder: string
  apiKey: string
  apiKeyPlaceholder: string
  apiKeyConfigured: string
  providerEnabled: string
  integration: string
  saveHint: string
}

function getCopy(locale: AppLocale): Copy {
  if (locale === "zh") {
    return {
      title: "治理设置",
      body: "统一维护企业治理偏好与模型编排。保存时会一起提交 SSO、席位备注、运行时接入模式，以及文本、图片、视频模型配置。",
      ssoDomain: "SSO 域名",
      ssoDomainPlaceholder: "例如 corp.example.com",
      seatRequestNote: "席位申请备注",
      seatRequestPlaceholder: "例如：席位扩容需要先经过采购审批。",
      runtimeIntakeMode: "运行时接入模式",
      runtimeDefault: "工作台默认",
      runtimeReview: "管理员审核",
      save: "保存设置",
      saving: "保存中...",
      saved: "设置已保存",
      saveFailed: "保存失败",
      readOnly: "当前账号为只读，可查看但不能修改治理设置。",
      modelSectionTitle: "模型配置",
      modelSectionBody: "支持按文本生成、图片生成、视频生成分别配置 provider、model、Base URL 和 API Key。每个分类只选择一个主 provider 作为默认路由。",
      categoryTabs: {
        text_generation: "文本生成",
        image_generation: "图片生成",
        video_generation: "视频生成",
      },
      categoryDescriptions: {
        text_generation: "支持 OpenAI Compatible、Qwen、MiniMax、GLM 官方接口。",
        image_generation: "支持 Google Nanobanana2、OpenAI gpt-image-2，以及 OpenAI Compatible 图片接口。",
        video_generation: "支持 MiniMax 海螺、Gemini Veo 3.1、Seedance 官方接口，以及 RunningHub API。",
      },
      supportedModels: "支持模型",
      selectedProvider: "默认 Provider",
      selectedModel: "默认 Model",
      selectedModelPlaceholder: "例如 qwen-max、gpt-image-2、veo-3.1",
      providerLabel: "展示名称",
      baseUrl: "Base URL",
      baseUrlPlaceholder: "官方接口可留空，兼容接口请填写完整地址",
      apiKey: "API Key",
      apiKeyPlaceholder: "留空则保持当前值或表示未配置",
      apiKeyConfigured: "已配置，留空保持不变",
      providerEnabled: "启用该 Provider",
      integration: "接入方式",
      saveHint: "只会保存当前可见企业的治理配置，不影响其他企业。",
    }
  }

  return {
    title: "Governance settings",
    body: "Manage enterprise governance preferences and model orchestration in one place. Saving submits SSO, seat-request notes, runtime intake mode, and text/image/video model settings together.",
    ssoDomain: "SSO domain",
    ssoDomainPlaceholder: "For example: corp.example.com",
    seatRequestNote: "Seat request note",
    seatRequestPlaceholder: "For example: Seat increases require procurement review first.",
    runtimeIntakeMode: "Runtime intake mode",
    runtimeDefault: "Workspace default",
    runtimeReview: "Admin review",
    save: "Save settings",
    saving: "Saving...",
    saved: "Settings saved",
    saveFailed: "Save failed",
    readOnly: "This account is read-only and can inspect governance settings without editing them.",
    modelSectionTitle: "Model configuration",
    modelSectionBody: "Configure provider, model, base URL, and API key separately for text, image, and video generation. Each category chooses one primary provider as the default route.",
    categoryTabs: {
      text_generation: "Text generation",
      image_generation: "Image generation",
      video_generation: "Video generation",
    },
    categoryDescriptions: {
      text_generation: "Supports OpenAI Compatible plus official Qwen, MiniMax, and GLM APIs.",
      image_generation: "Supports Google Nanobanana2, OpenAI gpt-image-2, and OpenAI Compatible image APIs.",
      video_generation: "Supports official MiniMax Hailuo, Gemini Veo 3.1, Seedance, and RunningHub APIs.",
    },
    supportedModels: "Supported models",
    selectedProvider: "Default provider",
    selectedModel: "Default model",
    selectedModelPlaceholder: "For example: qwen-max, gpt-image-2, veo-3.1",
    providerLabel: "Display label",
    baseUrl: "Base URL",
    baseUrlPlaceholder: "Leave empty for official APIs, fill for compatible endpoints",
    apiKey: "API key",
    apiKeyPlaceholder: "Leave empty to keep current value or indicate not configured",
    apiKeyConfigured: "Configured. Leave blank to keep unchanged",
    providerEnabled: "Enable this provider",
    integration: "Integration",
    saveHint: "This only saves governance settings for the current enterprise.",
  }
}

function updateCategoryConfig(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  updater: (config: EnterpriseModelCategoryConfig) => EnterpriseModelCategoryConfig,
) {
  return {
    ...settings,
    modelConfig: {
      ...settings.modelConfig,
      [category]: updater(settings.modelConfig[category]),
    },
  }
}

function updateProviderField(
  settings: CustomerGovernanceSettings,
  category: EnterpriseModelCategory,
  providerId: EnterpriseModelProviderId,
  field: "label" | "modelId" | "baseUrl" | "apiKey" | "enabled",
  value: string | boolean,
) {
  return updateCategoryConfig(settings, category, (config) => ({
    ...config,
    providers: config.providers.map((provider) =>
      provider.providerId === providerId ? { ...provider, [field]: value } : provider,
    ),
  }))
}

export function PlatformGovernanceSettingsPanel({
  locale,
  snapshot,
  initialCategory = "text_generation",
}: {
  locale: AppLocale
  snapshot: CustomerGovernanceSnapshot
  initialCategory?: EnterpriseModelCategory
}) {
  const copy = getCopy(locale)
  const [settings, setSettings] = useState<CustomerGovernanceSettings>(snapshot.settings)
  const [activeCategory, setActiveCategory] = useState<EnterpriseModelCategory>(initialCategory)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const canManageSettings = snapshot.canManageSettings
  async function saveSettings() {
    if (!canManageSettings) return

    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch("/api/platform/governance/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(settings),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; data?: CustomerGovernanceSettings }
        | null
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error || copy.saveFailed)
      }

      setSettings(payload.data)
      setMessage(copy.saved)
    } catch (error) {
      setMessage(error instanceof Error ? `${copy.saveFailed}: ${error.message}` : copy.saveFailed)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
      <div className="dashboard-kicker text-muted-foreground">{copy.title}</div>
      <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
        {copy.title}
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.body}</p>

      <div className="mt-5 grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="governance-sso-domain">{copy.ssoDomain}</Label>
          <Input
            id="governance-sso-domain"
            value={settings.ssoDomain || ""}
            disabled={!canManageSettings || isSaving}
            placeholder={copy.ssoDomainPlaceholder}
            onChange={(event) => setSettings((current) => ({ ...current, ssoDomain: event.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="governance-seat-note">{copy.seatRequestNote}</Label>
          <Textarea
            id="governance-seat-note"
            value={settings.seatRequestNote || ""}
            disabled={!canManageSettings || isSaving}
            placeholder={copy.seatRequestPlaceholder}
            onChange={(event) => setSettings((current) => ({ ...current, seatRequestNote: event.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="governance-runtime-intake">{copy.runtimeIntakeMode}</Label>
          <Select
            value={settings.runtimeIntakeMode}
            disabled={!canManageSettings || isSaving}
            onValueChange={(value) =>
              setSettings((current) => ({
                ...current,
                runtimeIntakeMode: value === "admin_review" ? "admin_review" : "workspace_default",
              }))
            }
          >
            <SelectTrigger id="governance-runtime-intake" className="w-full">
              <SelectValue placeholder={copy.runtimeIntakeMode} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace_default">{copy.runtimeDefault}</SelectItem>
              <SelectItem value="admin_review">{copy.runtimeReview}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <div className="dashboard-kicker text-muted-foreground">{copy.modelSectionTitle}</div>
        <h3 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
          {copy.modelSectionTitle}
        </h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.modelSectionBody}</p>

        <Tabs
          className="mt-5"
          value={activeCategory}
          onValueChange={(value) => setActiveCategory(value as EnterpriseModelCategory)}
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-[10px] bg-muted/60 p-1">
            <TabsTrigger value="text_generation" className="h-10 min-w-[120px] rounded-[8px] px-4">
              {copy.categoryTabs.text_generation}
            </TabsTrigger>
            <TabsTrigger value="image_generation" className="h-10 min-w-[120px] rounded-[8px] px-4">
              {copy.categoryTabs.image_generation}
            </TabsTrigger>
            <TabsTrigger value="video_generation" className="h-10 min-w-[120px] rounded-[8px] px-4">
              {copy.categoryTabs.video_generation}
            </TabsTrigger>
          </TabsList>

          {(["text_generation", "image_generation", "video_generation"] as EnterpriseModelCategory[]).map(
            (category) => {
              const categoryConfig = settings.modelConfig[category]
              const cards = getSupportedModelCards(category)
              return (
                <TabsContent key={category} value={category} className="mt-5 space-y-5">
                  <div className="dashboard-chip rounded-[8px] px-4 py-3 text-sm text-foreground/85">
                    {copy.categoryDescriptions[category]}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`selected-provider-${category}`}>{copy.selectedProvider}</Label>
                        <Select
                          value={categoryConfig.selectedProviderId || categoryConfig.providers[0]?.providerId}
                          disabled={!canManageSettings || isSaving}
                          onValueChange={(value) =>
                            setSettings((current) =>
                              updateCategoryConfig(current, category, (config) => ({
                                ...config,
                                selectedProviderId: value as EnterpriseModelProviderId,
                              })),
                            )
                          }
                        >
                          <SelectTrigger id={`selected-provider-${category}`} className="w-full">
                            <SelectValue placeholder={copy.selectedProvider} />
                          </SelectTrigger>
                          <SelectContent>
                            {cards.map((card) => (
                              <SelectItem key={card.providerId} value={card.providerId}>
                                {card.providerLabel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`selected-model-${category}`}>{copy.selectedModel}</Label>
                        <Input
                          id={`selected-model-${category}`}
                          value={categoryConfig.selectedModelId || ""}
                          disabled={!canManageSettings || isSaving}
                          placeholder={copy.selectedModelPlaceholder}
                          onChange={(event) =>
                            setSettings((current) =>
                              updateCategoryConfig(current, category, (config) => ({
                                ...config,
                                selectedModelId: event.target.value,
                              })),
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      {cards.map((card) => {
                        const provider =
                          categoryConfig.providers.find((item) => item.providerId === card.providerId) ||
                          categoryConfig.providers[0]
                        const isPrimary = categoryConfig.selectedProviderId === card.providerId

                        return (
                          <article
                            key={card.providerId}
                            className={
                              isPrimary
                                ? "rounded-[10px] border border-primary/35 bg-primary/5 p-4"
                                : "rounded-[10px] border border-border bg-background p-4"
                            }
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h4 className="text-base font-semibold text-foreground">{card.providerLabel}</h4>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {copy.integration}: {card.integrationLabel}
                                </p>
                              </div>
                              <div className="dashboard-chip rounded-[999px] px-3 py-1 text-xs text-foreground/85">
                                {isPrimary ? copy.selectedProvider : copy.providerEnabled}
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <span className="text-xs text-muted-foreground">{copy.supportedModels}</span>
                              {card.models.map((model) => (
                                <span
                                  key={model}
                                  className="dashboard-chip rounded-[999px] px-2.5 py-1 text-xs text-foreground/85"
                                >
                                  {model}
                                </span>
                              ))}
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`${category}-${card.providerId}-label`}>{copy.providerLabel}</Label>
                                <Input
                                  id={`${category}-${card.providerId}-label`}
                                  value={provider?.label || ""}
                                  disabled={!canManageSettings || isSaving}
                                  onChange={(event) =>
                                    setSettings((current) =>
                                      updateProviderField(
                                        current,
                                        category,
                                        card.providerId,
                                        "label",
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`${category}-${card.providerId}-model`}>{copy.selectedModel}</Label>
                                <Input
                                  id={`${category}-${card.providerId}-model`}
                                  value={provider?.modelId || ""}
                                  disabled={!canManageSettings || isSaving}
                                  placeholder={copy.selectedModelPlaceholder}
                                  onChange={(event) =>
                                    setSettings((current) =>
                                      updateProviderField(
                                        current,
                                        category,
                                        card.providerId,
                                        "modelId",
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`${category}-${card.providerId}-base-url`}>{copy.baseUrl}</Label>
                                <Input
                                  id={`${category}-${card.providerId}-base-url`}
                                  value={provider?.baseUrl || ""}
                                  disabled={!canManageSettings || isSaving}
                                  placeholder={copy.baseUrlPlaceholder}
                                  onChange={(event) =>
                                    setSettings((current) =>
                                      updateProviderField(
                                        current,
                                        category,
                                        card.providerId,
                                        "baseUrl",
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`${category}-${card.providerId}-api-key`}>{copy.apiKey}</Label>
                                <Input
                                  id={`${category}-${card.providerId}-api-key`}
                                  type="password"
                                  value={provider?.apiKey || ""}
                                  disabled={!canManageSettings || isSaving}
                                  placeholder={provider?.apiKeyConfigured ? copy.apiKeyConfigured : copy.apiKeyPlaceholder}
                                  onChange={(event) =>
                                    setSettings((current) =>
                                      updateProviderField(
                                        current,
                                        category,
                                        card.providerId,
                                        "apiKey",
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>

                            <label className="mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-border bg-card/60 px-3 py-3 text-sm text-foreground">
                              <span>{copy.providerEnabled}</span>
                              <input
                                type="checkbox"
                                checked={Boolean(provider?.enabled)}
                                disabled={!canManageSettings || isSaving}
                                onChange={(event) =>
                                  setSettings((current) =>
                                    updateProviderField(
                                      current,
                                      category,
                                      card.providerId,
                                      "enabled",
                                      event.target.checked,
                                    ),
                                  )
                                }
                              />
                            </label>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                </TabsContent>
              )
            },
          )}
        </Tabs>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={saveSettings} disabled={!canManageSettings || isSaving}>
          {isSaving ? copy.saving : copy.save}
        </Button>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
        {!canManageSettings ? <span className="text-xs text-muted-foreground">{copy.readOnly}</span> : null}
        <span className="text-xs text-muted-foreground">{copy.saveHint}</span>
      </div>
    </article>
  )
}

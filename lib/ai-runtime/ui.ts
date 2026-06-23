import type { AppLocale } from "@/lib/i18n/config"

import type { ModelDefinition } from "@/lib/ai-runtime/types"

export type RuntimeFormFieldView = {
  id: string
  type: "text" | "url" | "textarea" | "number" | "select"
  label: string
  placeholder?: string
  defaultValue?: string
  options?: Array<{ value: string; label: string }>
}

export function buildModelSelectOptions(models: ModelDefinition[]) {
  return models.map((model) => ({
    value: model.id,
    label: model.label,
  }))
}

export function buildRuntimeFieldsForModel(model: ModelDefinition, locale: AppLocale): RuntimeFormFieldView[] {
  void locale
  return model.parameterSchema
    .flatMap((field) => {
      if (field.type !== "text" && field.type !== "url" && field.type !== "textarea" && field.type !== "number" && field.type !== "select") {
        return []
      }

      return [{
        id: field.id,
        type: field.type,
        label: field.label,
        placeholder: field.placeholder,
        defaultValue: field.defaultValue == null ? undefined : String(field.defaultValue),
        options: field.options?.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      } satisfies RuntimeFormFieldView]
    })
}

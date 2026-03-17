"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

import { LOCALE_COOKIE_NAME, type AppLocale } from "@/lib/i18n/config"
import { messages } from "@/lib/i18n/messages"

type LocaleContextValue = {
  locale: AppLocale
  messages: (typeof messages)[AppLocale]
  setLocale: (locale: AppLocale) => void
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined)

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale
  children: ReactNode
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale)

  const setLocale = (nextLocale: AppLocale) => {
    setLocaleState(nextLocale)
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
  }

  const value = useMemo(
    () => ({
      locale,
      messages: messages[locale],
      setLocale,
    }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useI18n() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error("useI18n must be used within LocaleProvider")
  }
  return context
}

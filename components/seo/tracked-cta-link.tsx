"use client"

import Link from "next/link"

import { trackAnalyticsEvent } from "@/lib/seo/client-analytics"

type TrackedCtaLinkProps = React.ComponentProps<typeof Link> & {
  eventName: string
  eventData?: Record<string, string | number | boolean>
}

export function TrackedCtaLink({
  eventName,
  eventData,
  onClick,
  ...props
}: TrackedCtaLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        trackAnalyticsEvent(eventName, eventData)
        onClick?.(event)
      }}
    />
  )
}

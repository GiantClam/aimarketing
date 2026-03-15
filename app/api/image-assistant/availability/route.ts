import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import { getImageAssistantAvailability } from "@/lib/image-assistant/aiberm"

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({
        data: {
          enabled: false,
          provider: "unavailable",
          reason: "unauthenticated",
        },
      })
    }

    const availability = getImageAssistantAvailability()
    const hasAccess = hasFeatureAccess(currentUser, "image_design_generation")

    return NextResponse.json({
      data: {
        enabled: hasAccess && availability.enabled,
        provider: availability.provider,
        reason: hasAccess ? availability.reason : "feature_access_denied",
        models: availability.models,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

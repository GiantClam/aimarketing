import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import { getEnterpriseDifyKnowledgeStatus } from "@/lib/dify/enterprise-knowledge"
import { getWriterSkillsAvailability } from "@/lib/writer/skills"

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({
        data: {
          enabled: false,
          provider: "unavailable",
          reason: "unauthenticated",
          requiresWebResearch: false,
          webResearchEnabled: false,
        },
      })
    }

    const knowledge = await getEnterpriseDifyKnowledgeStatus(currentUser.enterpriseId)
    const writerAvailability = getWriterSkillsAvailability()
    const hasCopywritingAccess = hasFeatureAccess(currentUser, "copywriting_generation")

    return NextResponse.json({
      data: {
        enabled: hasCopywritingAccess && writerAvailability.enabled,
        provider: writerAvailability.provider,
        reason: hasCopywritingAccess ? writerAvailability.reason : "feature_access_denied",
        requiresWebResearch: writerAvailability.requiresWebResearch,
        webResearchEnabled: writerAvailability.webResearchEnabled,
        knowledge,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

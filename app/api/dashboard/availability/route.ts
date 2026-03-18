import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import { getAdvisorAvailability } from "@/lib/dify/config"
import { getEnterpriseDifyKnowledgeStatus } from "@/lib/dify/enterprise-knowledge"
import { getImageAssistantAvailability } from "@/lib/image-assistant/aiberm"
import { getWriterSkillsAvailability } from "@/lib/writer/skills"

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({
        data: {
          advisor: { brandStrategy: false, growth: false, leadHunter: false, copywriting: false, hasAny: false },
          writer: { enabled: false, provider: "unavailable", reason: "unauthenticated", knowledge: null },
          imageAssistant: { enabled: false, provider: "unavailable", reason: "unauthenticated" },
        },
      })
    }

    const [advisorAvailability, knowledge, writerSkillsAvailability] = await Promise.all([
      getAdvisorAvailability({
        userId: currentUser.id,
        userEmail: currentUser.email,
        enterpriseId: currentUser.enterpriseId,
      }),
      getEnterpriseDifyKnowledgeStatus(currentUser.enterpriseId),
      Promise.resolve(getWriterSkillsAvailability()),
    ])

    const imageAssistantAvailability = getImageAssistantAvailability()
    const hasAdvisorAccess = hasFeatureAccess(currentUser, "expert_advisor")
    const hasCopywritingAccess = hasFeatureAccess(currentUser, "copywriting_generation")
    const hasImageAssistantAccess = hasFeatureAccess(currentUser, "image_design_generation")

    const advisor = {
      brandStrategy: hasAdvisorAccess && advisorAvailability.brandStrategy,
      growth: hasAdvisorAccess && advisorAvailability.growth,
      leadHunter: hasAdvisorAccess && advisorAvailability.leadHunter,
      copywriting: hasCopywritingAccess && advisorAvailability.copywriting,
      hasAny:
        (hasAdvisorAccess && (advisorAvailability.brandStrategy || advisorAvailability.growth || advisorAvailability.leadHunter)) ||
        (hasCopywritingAccess && advisorAvailability.copywriting),
    }

    return NextResponse.json({
      data: {
        advisor,
        writer: {
          enabled: hasCopywritingAccess && writerSkillsAvailability.enabled,
          provider: writerSkillsAvailability.provider,
          reason: hasCopywritingAccess ? writerSkillsAvailability.reason : "feature_access_denied",
          knowledge,
        },
        imageAssistant: {
          enabled: hasImageAssistantAccess && imageAssistantAvailability.enabled,
          provider: imageAssistantAvailability.provider,
          reason: hasImageAssistantAccess ? imageAssistantAvailability.reason : "feature_access_denied",
          models: imageAssistantAvailability.models,
        },
      },
    })
  } catch (error: any) {
    console.error("dashboard.availability.error", error)
    return NextResponse.json({ error: error?.message || "dashboard_availability_failed" }, { status: 500 })
  }
}

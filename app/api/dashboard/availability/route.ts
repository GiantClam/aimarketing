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
          advisor: {
            brandStrategy: false,
            growth: false,
            companySearch: false,
            contactMining: false,
            copywriting: false,
            hasAny: false,
          },
          writer: { enabled: false, provider: "unavailable", reason: "unauthenticated", knowledge: null },
          imageAssistant: { enabled: false, provider: "unavailable", reason: "unauthenticated" },
        },
      })
    }

    const advisorAvailabilityPromise = getAdvisorAvailability({
      userId: currentUser.id,
      userEmail: currentUser.email,
      enterpriseId: currentUser.enterpriseId,
    })
    const knowledgePromise = getEnterpriseDifyKnowledgeStatus(currentUser.enterpriseId)
    const writerSkillsAvailability = getWriterSkillsAvailability()

    const imageAssistantAvailability = getImageAssistantAvailability()
    const hasAdvisorAccess = hasFeatureAccess(currentUser, "expert_advisor")
    const hasCopywritingAccess = hasFeatureAccess(currentUser, "copywriting_generation")
    const hasImageAssistantAccess = hasFeatureAccess(currentUser, "image_design_generation")

    const [advisorAvailabilityResult, knowledgeResult] = await Promise.allSettled([
      advisorAvailabilityPromise,
      knowledgePromise,
    ])

    const advisorAvailability =
      advisorAvailabilityResult.status === "fulfilled"
        ? advisorAvailabilityResult.value
        : {
            brandStrategy: hasAdvisorAccess,
            growth: hasAdvisorAccess,
            companySearch: hasAdvisorAccess,
            contactMining: hasAdvisorAccess,
            copywriting: hasCopywritingAccess,
            hasAny: hasAdvisorAccess || hasCopywritingAccess,
          }

    if (advisorAvailabilityResult.status === "rejected") {
      console.error("dashboard.availability.advisor.error", advisorAvailabilityResult.reason)
    }

    const knowledge =
      knowledgeResult.status === "fulfilled" ? knowledgeResult.value : { enabled: false, datasetCount: 0 as number }

    if (knowledgeResult.status === "rejected") {
      console.error("dashboard.availability.knowledge.error", knowledgeResult.reason)
    }

    const advisor = {
      brandStrategy: hasAdvisorAccess && advisorAvailability.brandStrategy,
      growth: hasAdvisorAccess && advisorAvailability.growth,
      companySearch: hasAdvisorAccess && advisorAvailability.companySearch,
      contactMining: hasAdvisorAccess && advisorAvailability.contactMining,
      copywriting: hasCopywritingAccess && advisorAvailability.copywriting,
      hasAny:
        (hasAdvisorAccess &&
          (advisorAvailability.brandStrategy ||
            advisorAvailability.growth ||
            advisorAvailability.companySearch ||
            advisorAvailability.contactMining)) ||
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

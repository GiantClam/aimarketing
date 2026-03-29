import { NextResponse, type NextRequest } from "next/server"

import { getSessionUser, isSessionDbUnavailableError } from "@/lib/auth/session"
import type { FeatureKey } from "@/lib/enterprise/constants"
import type { AuthUserPayload } from "@/lib/enterprise/server"
import { isLeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import { isFeatureRuntimeEnabled } from "@/lib/runtime-features"

export function hasFeatureAccess(user: AuthUserPayload, feature?: FeatureKey) {
  if (!feature) return true
  if (!isFeatureRuntimeEnabled(feature)) return false
  const isEnterpriseAdmin = user.enterpriseRole === "admin" && user.enterpriseStatus === "active"
  if (isEnterpriseAdmin) return true
  return Boolean(user.permissions?.[feature])
}

export function getAdvisorFeature(advisorType: string | null | undefined): FeatureKey | null {
  if (advisorType === "copywriting") return "copywriting_generation"
  if (advisorType === "brand-strategy" || advisorType === "growth" || isLeadHunterAdvisorType(advisorType)) return "expert_advisor"
  return null
}

export async function requireSessionUser(request: NextRequest, feature?: FeatureKey) {
  let user: Awaited<ReturnType<typeof getSessionUser>>
  try {
    user = await getSessionUser(request)
  } catch (error) {
    if (isSessionDbUnavailableError(error)) {
      console.warn("auth.session.user.lookup.unavailable", {
        message: error instanceof Error ? error.message : String(error),
      })
      return {
        response: NextResponse.json({ error: "auth_session_temporarily_unavailable" }, { status: 503 }),
      }
    }
    throw error
  }

  if (!user) {
    return {
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    }
  }

  if (feature && !isFeatureRuntimeEnabled(feature)) {
    return {
      response: NextResponse.json({ error: "Feature disabled" }, { status: 410 }),
    }
  }

  if (!hasFeatureAccess(user, feature)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return { user }
}

export async function requireAdvisorAccess(request: NextRequest, advisorType: string | null | undefined) {
  const feature = getAdvisorFeature(advisorType)
  if (!feature) {
    return {
      response: NextResponse.json({ error: "Invalid advisor type" }, { status: 400 }),
    }
  }

  return requireSessionUser(request, feature)
}

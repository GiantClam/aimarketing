import { NextRequest, NextResponse } from "next/server"

import { hasFeatureAccess } from "@/lib/auth/guards"
import { getSessionUser } from "@/lib/auth/session"
import { getWriterSkillsProvider, isWriterSkillsAvailable } from "@/lib/writer/skills"

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({ data: { enabled: false } })
    }

    return NextResponse.json({
      data: {
        enabled: hasFeatureAccess(currentUser, "copywriting_generation") && isWriterSkillsAvailable(),
        provider: getWriterSkillsProvider(),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getAdvisorAvailability } from "@/lib/dify/config"

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({
        data: {
          brandStrategy: false,
          growth: false,
          leadHunter: false,
          companySearch: false,
          contactMining: false,
          copywriting: false,
          hasAny: false,
        },
      })
    }

    const data = await getAdvisorAvailability({
      userId: currentUser.id,
      userEmail: currentUser.email,
      enterpriseId: currentUser.enterpriseId,
      enterpriseCode: currentUser.enterpriseCode,
    })

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

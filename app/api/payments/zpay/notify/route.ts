import { NextRequest } from "next/server"

import { handleZPayNotifyPost } from "@/modules/billing-kit/server/zpay-notify-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleZPayNotifyPost(request)
}

export async function GET(request: NextRequest) {
  return handleZPayNotifyPost(request)
}

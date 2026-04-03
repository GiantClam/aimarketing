import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getWriterSoulProfile, updateWriterSoulProfile } from "@/lib/writer/memory/repository"
import { parseAgentTypeParam, validateSoulProfilePatchPayload } from "@/lib/writer/memory/validators"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const agentType = parseAgentTypeParam(req.nextUrl.searchParams.get("agentType"))
    if (!agentType.ok) {
      return NextResponse.json({ error: agentType.error }, { status: agentType.status })
    }

    const profile = await getWriterSoulProfile(auth.user.id, agentType.data)
    return NextResponse.json({ data: profile })
  } catch (error: any) {
    console.error("writer.memory.profile.get.error", error)
    return NextResponse.json({ error: error?.message || "writer_memory_profile_get_failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => null)
    const parsed = validateSoulProfilePatchPayload(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }

    const profile = await updateWriterSoulProfile(auth.user.id, parsed.data.agentType, parsed.data.patch)
    return NextResponse.json({ data: profile })
  } catch (error: any) {
    console.error("writer.memory.profile.patch.error", error)
    return NextResponse.json({ error: error?.message || "writer_memory_profile_patch_failed" }, { status: 500 })
  }
}


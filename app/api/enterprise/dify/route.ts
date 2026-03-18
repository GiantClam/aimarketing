import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  getEnterpriseDifyBinding,
  type EnterpriseDifyDatasetInput,
  upsertEnterpriseDifyBinding,
} from "@/lib/dify/enterprise-knowledge"

function getEnterpriseIdFromSession(currentUser: Awaited<ReturnType<typeof getSessionUser>>) {
  const enterpriseId = currentUser?.enterpriseId
  return typeof enterpriseId === "number" && Number.isFinite(enterpriseId) && enterpriseId > 0 ? enterpriseId : null
}

function isActiveEnterpriseMember(currentUser: Awaited<ReturnType<typeof getSessionUser>>) {
  return Boolean(getEnterpriseIdFromSession(currentUser) && currentUser?.enterpriseStatus === "active")
}

function isActiveEnterpriseAdmin(currentUser: Awaited<ReturnType<typeof getSessionUser>>) {
  return Boolean(
    getEnterpriseIdFromSession(currentUser) &&
      currentUser?.enterpriseRole === "admin" &&
      currentUser?.enterpriseStatus === "active",
  )
}

function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim()
  if (!trimmed) return ""
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}

function serializeBinding(binding: Awaited<ReturnType<typeof getEnterpriseDifyBinding>>) {
  if (!binding) return null

  return {
    id: binding.id,
    enterpriseId: binding.enterpriseId,
    baseUrl: binding.baseUrl,
    enabled: binding.enabled,
    hasApiKey: Boolean(binding.apiKey.trim()),
    apiKeyMasked: maskApiKey(binding.apiKey),
    datasets: binding.datasets,
  }
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    if (!isActiveEnterpriseMember(currentUser)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const enterpriseId = getEnterpriseIdFromSession(currentUser)
    if (!enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    const binding = await getEnterpriseDifyBinding(enterpriseId)
    return NextResponse.json({
      data: {
        binding: serializeBinding(binding),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    if (!isActiveEnterpriseAdmin(currentUser)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const enterpriseId = getEnterpriseIdFromSession(currentUser)
    if (!enterpriseId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    const existing = await getEnterpriseDifyBinding(enterpriseId)
    const body = await request.json()
    const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : existing?.baseUrl || ""
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey : existing?.apiKey || ""
    const enabled = typeof body?.enabled === "boolean" ? body.enabled : Boolean(existing?.enabled)
    const datasets = Array.isArray(body?.datasets) ? body.datasets : existing?.datasets || []

    const normalizedDatasets: EnterpriseDifyDatasetInput[] = datasets.map((dataset: any) => ({
      datasetId: String(dataset?.datasetId || ""),
      datasetName: String(dataset?.datasetName || ""),
      scope: dataset?.scope,
      priority: Number(dataset?.priority || 100),
      enabled: Boolean(dataset?.enabled),
    }))

    const binding = await upsertEnterpriseDifyBinding(enterpriseId, {
      baseUrl,
      apiKey,
      enabled,
      datasets: normalizedDatasets,
    })

    return NextResponse.json({
      data: {
        binding: serializeBinding(binding),
      },
    })
  } catch (error: any) {
    const status = typeof error?.message === "string" && error.message.includes("required") ? 400 : 500
    return NextResponse.json({ error: error.message || "failed" }, { status })
  }
}

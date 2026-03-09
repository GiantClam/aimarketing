import { NextRequest } from "next/server"
import { Pool } from "pg"
import "./load-env"

import { POST as registerPost } from "@/app/api/auth/register/route"
import { POST as loginPost } from "@/app/api/auth/login/route"
import { GET as requestsGet } from "@/app/api/enterprise/requests/route"
import { POST as requestReviewPost } from "@/app/api/enterprise/requests/[requestId]/route"
import { POST as permissionPost } from "@/app/api/enterprise/permissions/route"

function expect(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function extractCookie(res: Response) {
  const raw = res.headers.get("set-cookie")
  return raw ? raw.split(";")[0] : null
}

function makeReq(url: string, method = "GET", body?: unknown, cookie?: string | null) {
  const headers = new Headers({ "content-type": "application/json" })
  if (cookie) {
    headers.set("cookie", cookie)
  }

  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function json(res: Response) {
  return res.json()
}

async function run() {
  const suffix = Date.now().toString().slice(-8)
  const adminEmail = `qa_admin_rej_${suffix}@example.com`
  const memberEmail = `qa_member_rej_${suffix}@example.com`
  const password = "Qa#12345678"

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!dbUrl) throw new Error("DATABASE_URL is required")
  const pool = new Pool({ connectionString: dbUrl })

  let adminUserId: number | null = null
  let memberUserId: number | null = null
  let enterpriseId: number | null = null
  let adminCookie: string | null = null
  let memberCookie: string | null = null

  try {
    const createAdmin = await registerPost(
      makeReq("http://localhost/api/auth/register", "POST", {
        name: "QA Reject Admin",
        email: adminEmail,
        password,
        enterpriseAction: "create",
        enterpriseName: `QA Reject Enterprise ${suffix}`,
      }),
    )
    const createAdminJson = await json(createAdmin)
    expect(createAdmin.status === 200, `create admin failed: ${JSON.stringify(createAdminJson)}`)
    adminUserId = Number(createAdminJson.user.id)
    enterpriseId = Number(createAdminJson.user.enterpriseId)
    adminCookie = extractCookie(createAdmin)
    expect(adminCookie, "create admin should set session cookie")
    const enterpriseCode = String(createAdminJson.user.enterpriseCode)

    const createMember = await registerPost(
      makeReq("http://localhost/api/auth/register", "POST", {
        name: "QA Reject Member",
        email: memberEmail,
        password,
        enterpriseAction: "join",
        enterpriseCode,
      }),
    )
    const createMemberJson = await json(createMember)
    expect(createMember.status === 200, `create member failed: ${JSON.stringify(createMemberJson)}`)
    memberUserId = Number(createMemberJson.user.id)
    memberCookie = extractCookie(createMember)
    expect(memberCookie, "create member should set session cookie")

    const nonAdminList = await requestsGet(makeReq("http://localhost/api/enterprise/requests", "GET", undefined, memberCookie))
    expect(nonAdminList.status === 403, "non-admin should not list requests")

    const list = await requestsGet(makeReq("http://localhost/api/enterprise/requests", "GET", undefined, adminCookie))
    const listJson = await json(list)
    expect(list.status === 200, `admin list failed: ${JSON.stringify(listJson)}`)
    const reqItem = (listJson.data || []).find((x: any) => x.userId === memberUserId)
    expect(reqItem, "pending request should exist for reject flow")

    const reject = await requestReviewPost(
      makeReq("http://localhost/api/enterprise/requests/review", "POST", {
        action: "reject",
        note: "reject for qa",
      }, adminCookie),
      { params: Promise.resolve({ requestId: String(reqItem.requestId) }) },
    )
    const rejectJson = await json(reject)
    expect(reject.status === 200, `reject failed: ${JSON.stringify(rejectJson)}`)

    const memberLogin = await loginPost(makeReq("http://localhost/api/auth/login", "POST", { email: memberEmail, password }))
    const memberLoginJson = await json(memberLogin)
    expect(memberLogin.status === 200, `member login after reject failed: ${JSON.stringify(memberLoginJson)}`)
    expect(memberLoginJson.user.enterpriseStatus === "rejected", "rejected member should have rejected status")

    const nonAdminPerm = await permissionPost(
      makeReq("http://localhost/api/enterprise/permissions", "POST", {
        targetUserId: memberUserId,
        permissions: { expert_advisor: true },
      }, memberCookie),
    )
    expect(nonAdminPerm.status === 403, "non-admin should not update permissions")

    console.log("REJECT_FLOW_TESTS_PASSED")
  } finally {
    try {
      if (memberUserId) {
        await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [memberUserId])
        await pool.query("DELETE FROM user_feature_permissions WHERE user_id = $1", [memberUserId])
        await pool.query("DELETE FROM enterprise_join_requests WHERE user_id = $1", [memberUserId])
        await pool.query("DELETE FROM users WHERE id = $1", [memberUserId])
      }
      if (adminUserId) {
        await pool.query("DELETE FROM enterprise_join_requests WHERE reviewed_by = $1", [adminUserId])
        await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [adminUserId])
        await pool.query("DELETE FROM user_feature_permissions WHERE user_id = $1", [adminUserId])
        await pool.query("DELETE FROM users WHERE id = $1", [adminUserId])
      }
      if (enterpriseId) {
        await pool.query("DELETE FROM enterprises WHERE id = $1", [enterpriseId])
      }
    } catch (cleanupError) {
      console.error("cleanup error:", cleanupError)
    }
    await pool.end()
  }
}

run().catch((err) => {
  console.error("TEST_FAILED", err)
  process.exit(1)
})

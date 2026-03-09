import { NextRequest } from "next/server"
import { Pool } from "pg"
import "./load-env"

import { POST as registerPost } from "@/app/api/auth/register/route"
import { POST as loginPost } from "@/app/api/auth/login/route"
import { GET as lookupGet } from "@/app/api/enterprise/lookup/route"
import { GET as requestsGet } from "@/app/api/enterprise/requests/route"
import { POST as requestReviewPost } from "@/app/api/enterprise/requests/[requestId]/route"
import { POST as permissionPost } from "@/app/api/enterprise/permissions/route"
import { GET as membersGet } from "@/app/api/enterprise/members/route"
import { PUT as profilePut } from "@/app/api/auth/profile/route"
import { GET as advisorAvailabilityGet } from "@/app/api/dify/advisors/availability/route"

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
  const adminEmail = `qa_admin_${suffix}@example.com`
  const memberEmail = `qa_member_${suffix}@example.com`
  const password = "Qa#12345678"

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!dbUrl) throw new Error("DATABASE_URL is required for tests")

  const pool = new Pool({ connectionString: dbUrl })

  let adminUserId: number | null = null
  let memberUserId: number | null = null
  let enterpriseId: number | null = null
  let adminCookie: string | null = null
  let memberCookie: string | null = null

  try {
    console.log("[1] register admin(create enterprise)")
    const registerAdminRes = await registerPost(
      makeReq("http://localhost/api/auth/register", "POST", {
        name: "QA Admin",
        email: adminEmail,
        password,
        enterpriseAction: "create",
        enterpriseName: `QA Enterprise ${suffix}`,
      }),
    )
    const registerAdminJson = await json(registerAdminRes)
    expect(registerAdminRes.status === 200, `register admin failed: ${JSON.stringify(registerAdminJson)}`)
    expect(registerAdminJson.user.enterpriseRole === "admin", "admin role should be admin")
    expect(registerAdminJson.user.enterpriseStatus === "active", "admin status should be active")
    expect(registerAdminJson.user.enterpriseCode, "enterpriseCode should exist")

    const enterpriseCode = registerAdminJson.user.enterpriseCode as string
    adminUserId = Number(registerAdminJson.user.id)
    enterpriseId = Number(registerAdminJson.user.enterpriseId)
    adminCookie = extractCookie(registerAdminRes)
    expect(adminCookie, "register admin should set session cookie")

    console.log("[2] enterprise lookup")
    const lookupRes = await lookupGet(makeReq(`http://localhost/api/enterprise/lookup?code=${encodeURIComponent(enterpriseCode)}`))
    const lookupJson = await json(lookupRes)
    expect(lookupRes.status === 200 && lookupJson.found, "lookup should find enterprise")

    console.log("[3] login admin")
    const loginAdminRes = await loginPost(
      makeReq("http://localhost/api/auth/login", "POST", { email: adminEmail, password }),
    )
    const loginAdminJson = await json(loginAdminRes)
    expect(loginAdminRes.status === 200, `login admin failed: ${JSON.stringify(loginAdminJson)}`)
    expect(loginAdminJson.user.enterpriseRole === "admin", "login admin should keep admin role")
    adminCookie = extractCookie(loginAdminRes) || adminCookie

    console.log("[4] register member(join enterprise)")
    const registerMemberRes = await registerPost(
      makeReq("http://localhost/api/auth/register", "POST", {
        name: "QA Member",
        email: memberEmail,
        password,
        enterpriseAction: "join",
        enterpriseCode,
        joinNote: "QA join request",
      }),
    )
    const registerMemberJson = await json(registerMemberRes)
    expect(registerMemberRes.status === 200, `register member failed: ${JSON.stringify(registerMemberJson)}`)
    expect(registerMemberJson.requiresApproval === true, "member join should require approval")
    expect(registerMemberJson.user.enterpriseStatus === "pending", "member status should be pending")
    memberUserId = Number(registerMemberJson.user.id)
    memberCookie = extractCookie(registerMemberRes)
    expect(memberCookie, "register member should set session cookie")

    console.log("[5] login member pending")
    const loginMemberPendingRes = await loginPost(
      makeReq("http://localhost/api/auth/login", "POST", { email: memberEmail, password }),
    )
    const loginMemberPendingJson = await json(loginMemberPendingRes)
    expect(loginMemberPendingRes.status === 200, `login member pending failed: ${JSON.stringify(loginMemberPendingJson)}`)
    expect(loginMemberPendingJson.user.enterpriseStatus === "pending", "member should still be pending")
    memberCookie = extractCookie(loginMemberPendingRes) || memberCookie

    console.log("[6] admin list pending requests")
    const requestsRes = await requestsGet(makeReq("http://localhost/api/enterprise/requests", "GET", undefined, adminCookie))
    const requestsJson = await json(requestsRes)
    expect(requestsRes.status === 200, `requests list failed: ${JSON.stringify(requestsJson)}`)
    const reqItem = (requestsJson.data || []).find((item: any) => item.userEmail === memberEmail)
    expect(reqItem, "pending request for member should exist")

    console.log("[7] admin approve request")
    const approveRes = await requestReviewPost(
      makeReq("http://localhost/api/enterprise/requests/review", "POST", {
        action: "approve",
      }, adminCookie),
      { params: Promise.resolve({ requestId: String(reqItem.requestId) }) },
    )
    const approveJson = await json(approveRes)
    expect(approveRes.status === 200, `approve failed: ${JSON.stringify(approveJson)}`)

    console.log("[8] admin grant permissions")
    const permRes = await permissionPost(
      makeReq("http://localhost/api/enterprise/permissions", "POST", {
        targetUserId: memberUserId,
        permissions: {
          expert_advisor: true,
          website_generation: true,
          video_generation: false,
          copywriting_generation: true,
        },
      }, adminCookie),
    )
    const permJson = await json(permRes)
    expect(permRes.status === 200, `permission update failed: ${JSON.stringify(permJson)}`)

    console.log("[9] login member active + permissions")
    const loginMemberActiveRes = await loginPost(
      makeReq("http://localhost/api/auth/login", "POST", { email: memberEmail, password }),
    )
    const loginMemberActiveJson = await json(loginMemberActiveRes)
    expect(loginMemberActiveRes.status === 200, `login member active failed: ${JSON.stringify(loginMemberActiveJson)}`)
    expect(loginMemberActiveJson.user.enterpriseStatus === "active", "member should be active after approval")
    expect(loginMemberActiveJson.user.permissions.expert_advisor === true, "expert permission should be true")
    expect(loginMemberActiveJson.user.permissions.website_generation === true, "website permission should be true")
    expect(loginMemberActiveJson.user.permissions.video_generation === false, "video permission should be false")
    expect(loginMemberActiveJson.user.permissions.copywriting_generation === true, "copywriting permission should be true")
    memberCookie = extractCookie(loginMemberActiveRes) || memberCookie

    console.log("[10] profile update")
    const profileRes = await profilePut(
      makeReq("http://localhost/api/auth/profile", "PUT", { name: "QA Member Updated" }, memberCookie),
    )
    const profileJson = await json(profileRes)
    expect(profileRes.status === 200, `profile update failed: ${JSON.stringify(profileJson)}`)
    expect(profileJson.user.name === "QA Member Updated", "profile name should update")

    console.log("[11] members list")
    const membersRes = await membersGet(makeReq("http://localhost/api/enterprise/members", "GET", undefined, adminCookie))
    const membersJson = await json(membersRes)
    expect(membersRes.status === 200, `members list failed: ${JSON.stringify(membersJson)}`)
    const memberItem = (membersJson.data || []).find((item: any) => item.email === memberEmail)
    expect(memberItem, "members list should contain approved user")
    expect(memberItem.permissions.copywriting_generation === true, "members list permissions should reflect update")

    console.log("[12] advisor availability API")
    const advisorRes = await advisorAvailabilityGet(
      makeReq(`http://localhost/api/dify/advisors/availability?userId=${memberUserId}&userEmail=${encodeURIComponent(memberEmail)}`),
    )
    const advisorJson = await json(advisorRes)
    expect(advisorRes.status === 200, `advisor availability failed: ${JSON.stringify(advisorJson)}`)
    expect(typeof advisorJson.data.hasAny === "boolean", "advisor availability should return boolean payload")

    console.log("ALL_TESTS_PASSED")
  } finally {
    // cleanup test records
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

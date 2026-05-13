const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

require("./load-env")

const PAYPAL_ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"
const PAYPAL_CLIENT_ID = String(process.env.PAYPAL_CLIENT_ID || "").trim()
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || "").trim()
const APP_URL = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim()
const ENV_FILE_PATH = path.join(process.cwd(), ".env")
const PRODUCT_NAME = "AI Marketing Membership"

const PLAN_CONFIGS = [
  {
    code: "starter",
    envKey: "PAYPAL_STARTER_PLAN_ID",
    name: "AI Marketing Starter",
    description: "Starter plan with shared monthly credits for small marketing teams.",
    priceUsd: "9.90",
  },
  {
    code: "creator",
    envKey: "PAYPAL_CREATOR_PLAN_ID",
    name: "AI Marketing Creator",
    description: "Creator plan with higher shared monthly credits and team capacity.",
    priceUsd: "19.90",
  },
  {
    code: "studio",
    envKey: "PAYPAL_STUDIO_PLAN_ID",
    name: "AI Marketing Studio",
    description: "Studio plan with premium shared monthly credits and workspace seats.",
    priceUsd: "59.90",
  },
]

function getApiBase() {
  return PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
}

function assertRequiredEnv() {
  const missing = []
  if (!PAYPAL_CLIENT_ID) missing.push("PAYPAL_CLIENT_ID")
  if (!PAYPAL_CLIENT_SECRET) missing.push("PAYPAL_CLIENT_SECRET")
  if (!process.env.PAYPAL_ENV) missing.push("PAYPAL_ENV")

  if (missing.length > 0) {
    throw new Error(`paypal_env_missing:${missing.join(",")}`)
  }
}

function makeRequestId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`
}

async function getAccessToken() {
  const response = await fetch(`${getApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`paypal_access_token_http_${response.status}:${JSON.stringify(payload)}`)
  }
  const accessToken = typeof payload?.access_token === "string" ? payload.access_token.trim() : ""
  if (!accessToken) throw new Error("paypal_access_token_missing")
  return accessToken
}

async function createProduct(accessToken) {
  const response = await fetch(`${getApiBase()}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": makeRequestId("aimarketing-product"),
    },
    body: JSON.stringify({
      name: PRODUCT_NAME,
      description: `Subscription product for ${APP_URL || "AI Marketing"} billing plans`,
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`paypal_create_product_http_${response.status}:${JSON.stringify(payload)}`)
  }
  const productId = typeof payload?.id === "string" ? payload.id.trim() : ""
  if (!productId) throw new Error("paypal_product_id_missing")
  return { productId, payload }
}

async function createPlan(accessToken, productId, plan) {
  const response = await fetch(`${getApiBase()}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": makeRequestId(`aimarketing-${plan.code}`),
    },
    body: JSON.stringify({
      product_id: productId,
      name: plan.name,
      description: plan.description,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: "MONTH",
            interval_count: 1,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: plan.priceUsd,
              currency_code: "USD",
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
      quantity_supported: false,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`paypal_create_plan_http_${response.status}:${plan.code}:${JSON.stringify(payload)}`)
  }
  const planId = typeof payload?.id === "string" ? payload.id.trim() : ""
  if (!planId) throw new Error(`paypal_plan_id_missing:${plan.code}`)
  return { planId, payload }
}

function upsertEnvValues(filePath, values) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : ""
  const lines = existing ? existing.split(/\r?\n/) : []
  const updatedKeys = new Set()

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=.*$/)
    if (!match) return line
    const key = match[1]
    if (!Object.prototype.hasOwnProperty.call(values, key)) return line
    updatedKeys.add(key)
    return `${key}=${values[key]}`
  })

  for (const [key, value] of Object.entries(values)) {
    if (!updatedKeys.has(key)) {
      nextLines.push(`${key}=${value}`)
    }
  }

  fs.writeFileSync(filePath, `${nextLines.join("\n").replace(/\n+$/g, "")}\n`, "utf8")
}

async function main() {
  assertRequiredEnv()
  console.log(`[paypal] creating subscription product and plans in ${PAYPAL_ENV}`)

  const accessToken = await getAccessToken()
  const { productId } = await createProduct(accessToken)
  console.log(`[paypal] created product ${productId}`)

  const envUpdates = {}
  for (const plan of PLAN_CONFIGS) {
    const { planId } = await createPlan(accessToken, productId, plan)
    envUpdates[plan.envKey] = planId
    console.log(`[paypal] created ${plan.code} plan ${planId}`)
  }

  upsertEnvValues(ENV_FILE_PATH, envUpdates)

  console.log("[paypal] updated .env with plan ids")
  console.log(`PAYPAL_STARTER_PLAN_ID=${envUpdates.PAYPAL_STARTER_PLAN_ID}`)
  console.log(`PAYPAL_CREATOR_PLAN_ID=${envUpdates.PAYPAL_CREATOR_PLAN_ID}`)
  console.log(`PAYPAL_STUDIO_PLAN_ID=${envUpdates.PAYPAL_STUDIO_PLAN_ID}`)
  console.log("[paypal] next: configure PAYPAL_WEBHOOK_ID after webhook is created in PayPal Developer Dashboard")
}

main().catch((error) => {
  console.error("[paypal] plan creation failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})

import { createHash, timingSafeEqual } from "node:crypto"

export type ZPayParams = Record<string, string | number | null | undefined>

function normalizeValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
}

export function buildZPayPreString(params: ZPayParams) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && normalizeValue(value) !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${normalizeValue(value)}`)
    .join("&")
}

export function buildZPaySignature(params: ZPayParams, key: string) {
  return createHash("md5").update(buildZPayPreString(params) + key.trim(), "utf8").digest("hex")
}

export function verifyZPaySignature(params: ZPayParams, key: string) {
  const expected = buildZPaySignature(params, key)
  const received = normalizeValue(params.sign).toLowerCase()
  if (!received || received.length !== expected.length) return false
  return timingSafeEqual(
    Buffer.from(expected) as unknown as Uint8Array<ArrayBuffer>,
    Buffer.from(received) as unknown as Uint8Array<ArrayBuffer>,
  )
}

export function isZPayEnabled() {
  return process.env.ZPAY_ENABLED === "true"
}

export function isZPayConfigured() {
  return isZPayEnabled() && Boolean(process.env.ZPAY_PID?.trim()) && Boolean(process.env.ZPAY_KEY?.trim())
}

export function getZPayKey() {
  return process.env.ZPAY_KEY?.trim() || ""
}

function formatMoney(amountMinor: number) {
  return (amountMinor / 100).toFixed(2)
}

export function buildZPayPaymentUrl(input: {
  origin: string
  orderNo: string
  amountMinor: number
  name: string
}) {
  const notifyUrl = process.env.ZPAY_NOTIFY_URL?.trim() || `${input.origin}/api/payments/zpay/notify`
  const returnUrl =
    process.env.ZPAY_RETURN_URL?.trim() ||
    `${input.origin}/dashboard/billing?zpay=return&orderNo=${encodeURIComponent(input.orderNo)}`
  const params: ZPayParams = {
    pid: process.env.ZPAY_PID?.trim() || "",
    money: formatMoney(input.amountMinor),
    name: input.name,
    notify_url: notifyUrl,
    out_trade_no: input.orderNo,
    return_url: returnUrl,
    sitename: process.env.ZPAY_SITE_NAME?.trim() || "AI Marketing",
    type: "alipay",
  }
  const url = new URL(process.env.ZPAY_SUBMIT_URL?.trim() || "https://z-pay.cn/submit.php")
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, normalizeValue(value)])),
    sign: buildZPaySignature(params, getZPayKey()),
    sign_type: "MD5",
  })
  url.search = query.toString()
  return url.toString()
}

function getParam(params: ZPayParams, ...keys: string[]) {
  for (const key of keys) {
    const value = normalizeValue(params[key])
    if (value) return value
  }
  return ""
}

export function getZPayOrderNo(params: ZPayParams) {
  return getParam(params, "out_trade_no", "order_no", "merchant_order_no")
}

export function getZPayProviderTradeNo(params: ZPayParams) {
  return getParam(params, "trade_no", "transaction_id", "id") || null
}

export function getZPayReportedPid(params: ZPayParams) {
  return getParam(params, "pid", "merchant_id")
}

export function getZPayStatus(params: ZPayParams) {
  return getParam(params, "trade_status", "status", "payment_status", "return_status", "result").toLowerCase()
}

export function isZPayPaymentSuccessful(params: ZPayParams) {
  return new Set(["success", "paid", "succeeded", "trade_success", "successed", "1", "true"]).has(
    getZPayStatus(params).replace(/[-\s]/g, "_"),
  )
}

export function parseZPayAmountMinor(raw: unknown) {
  const value = normalizeValue(raw)
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null
  const [yuan, cents = ""] = value.split(".")
  const minor = Number(yuan) * 100 + Number((cents + "00").slice(0, 2))
  return Number.isSafeInteger(minor) ? minor : null
}

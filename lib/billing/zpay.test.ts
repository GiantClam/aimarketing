import assert from "node:assert/strict"
import test from "node:test"

import {
  buildZPayPaymentUrl,
  buildZPayPreString,
  buildZPaySignature,
  isZPayPaymentSuccessful,
  parseZPayAmountMinor,
  verifyZPaySignature,
} from "./zpay"

test("Z-Pay signs sorted non-empty fields and verifies the callback signature", () => {
  const params = { pid: "123", money: "89.90", name: "5000 credits", empty: "", type: "alipay" }
  assert.equal(buildZPayPreString(params), "money=89.90&name=5000 credits&pid=123&type=alipay")
  const sign = buildZPaySignature(params, "secret")
  assert.equal(sign, "93a76392351d5eb34db1968c373f4066")
  assert.equal(verifyZPaySignature({ ...params, sign, sign_type: "MD5" }, "secret"), true)
  assert.equal(verifyZPaySignature({ ...params, sign: "wrong" }, "secret"), false)
})

test("Z-Pay payment URL targets Alipay and formats CNY cents exactly", () => {
  const original = {
    ZPAY_PID: process.env.ZPAY_PID,
    ZPAY_KEY: process.env.ZPAY_KEY,
    ZPAY_SUBMIT_URL: process.env.ZPAY_SUBMIT_URL,
  }
  process.env.ZPAY_PID = "123"
  process.env.ZPAY_KEY = "secret"
  process.env.ZPAY_SUBMIT_URL = "https://z-pay.cn/submit.php"
  try {
    const url = new URL(buildZPayPaymentUrl({ origin: "https://aimarketingsite.com", orderNo: "order-1", amountMinor: 8_990, name: "5000 积分包" }))
    assert.equal(url.searchParams.get("type"), "alipay")
    assert.equal(url.searchParams.get("money"), "89.90")
    assert.equal(url.searchParams.get("out_trade_no"), "order-1")
    assert.equal(url.searchParams.get("sign_type"), "MD5")
    assert.ok(url.searchParams.get("sign"))
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("Z-Pay callback helpers accept successful statuses and parse money without floats", () => {
  assert.equal(isZPayPaymentSuccessful({ trade_status: "TRADE_SUCCESS" }), true)
  assert.equal(isZPayPaymentSuccessful({ status: "paid" }), true)
  assert.equal(isZPayPaymentSuccessful({ status: "WAIT_BUYER_PAY" }), false)
  assert.equal(parseZPayAmountMinor("89.9"), 8_990)
  assert.equal(parseZPayAmountMinor("89.90"), 8_990)
  assert.equal(parseZPayAmountMinor("89.999"), null)
})

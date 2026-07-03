import assert from "node:assert/strict"
import test from "node:test"

import { renderAiEntryDisplayErrorMessage } from "./error-display"

test("maps workspace credit exhaustion to billing copy", () => {
  assert.equal(
    renderAiEntryDisplayErrorMessage({
      value: "insufficient_credits",
      unknownError: "未知错误",
      isZh: true,
    }),
    "当前工作区共享积分不足，请前往计费页充值或升级套餐。",
  )
})

test("maps upstream quota exhaustion separately from workspace billing", () => {
  assert.equal(
    renderAiEntryDisplayErrorMessage({
      value: "Your account quota is insufficient. Please recharge. (request id: abc123)",
      unknownError: "Unknown error",
      isZh: false,
    }),
    "The upstream model or remote runtime account is out of quota. This is separate from your workspace credits. Check the provider or PPT worker account quota. (request id: abc123)",
  )
})

test("maps unknown PPT worker model to a supported-model hint", () => {
  assert.equal(
    renderAiEntryDisplayErrorMessage({
      value: "invalid params, unknown model 'gpt-5.4' (2013)",
      unknownError: "Unknown error",
      isZh: true,
    }),
    '当前 PPT 运行时不支持模型 "gpt-5.4"。请改用 MiniMax-M3、MiniMax-M2.7-highspeed 或 step-3.7-flash。',
  )
})

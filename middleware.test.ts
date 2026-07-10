import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"

import { middleware } from "./middleware"

test("preserves AI agent query parameters through the login redirect", () => {
  const response = middleware(
    new NextRequest("https://www.aimarketingsite.com/dashboard/ai/479?agent=executive-ppt&entry=chat"),
  )

  assert.equal(response.status, 307)
  assert.equal(
    response.headers.get("location"),
    "https://www.aimarketingsite.com/login?next=%2Fdashboard%2Fai%2F479%3Fagent%3Dexecutive-ppt%26entry%3Dchat",
  )
})

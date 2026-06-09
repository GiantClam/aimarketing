import assert from "node:assert/strict"
import test from "node:test"

import { buildPlatformLaunchPath } from "@/lib/platform/launch-path"

test("platform launch path encodes registry targets consistently", () => {
  assert.equal(
    buildPlatformLaunchPath({
      itemType: "capability",
      slug: "ai-image",
      surface: "public",
      locale: "zh",
    }),
    "/api/platform/launch?type=capability&slug=ai-image&surface=public&locale=zh",
  )

  assert.equal(
    buildPlatformLaunchPath({
      itemType: "mcp_service",
      slug: "design-context-mcp",
      surface: "workspace",
      locale: "en",
    }),
    "/api/platform/launch?type=mcp_service&slug=design-context-mcp&surface=workspace&locale=en",
  )
})

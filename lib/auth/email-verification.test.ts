import assert from "node:assert/strict"
import test from "node:test"

import { buildVerificationEmailContent, escapeHtml } from "./email-verification"

test("NORMAL: escapeHtml escapes HTML-sensitive characters", () => {
  assert.equal(
    escapeHtml(`A&B<>"'`),
    "A&amp;B&lt;&gt;&#34;&#39;",
  )
})

test("BOUNDARY: escapeHtml handles very long string (10000+ chars)", () => {
  const input = `${"a".repeat(9996)}&<><`
  const expected = `${"a".repeat(9996)}&amp;&lt;&gt;&lt;`

  assert.equal(input.length, 10000)
  assert.equal(escapeHtml(input), expected)
  assert.equal(escapeHtml(input).length, 10013)
})

test("SECURITY: verification email HTML escapes unsafe name and URL values", () => {
  const content = buildVerificationEmailContent({
    name: `<img src=x onerror="alert(1)">`,
    verificationUrl: `https://example.com/verify?token="abc"&next=<script>`,
  })

  assert.match(content.html, /&lt;img src=x onerror=&#34;alert\(1\)&#34;&gt;/)
  assert.match(content.html, /token=&#34;abc&#34;&amp;next=&lt;script&gt;/)
  assert.doesNotMatch(content.html, /<img src=x/)
})

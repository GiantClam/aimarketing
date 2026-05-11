import "./load-env"

import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { provisionDefaultBillingForUserId } from "@/lib/billing/provision"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"

async function main() {
  await ensureEnterpriseAuthTables()

  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)

  let provisioned = 0
  for (const row of rows) {
    await provisionDefaultBillingForUserId(row.id)
    provisioned += 1
    if (provisioned % 25 === 0) {
      console.info("billing.free-plan.backfill.progress", {
        provisioned,
        total: rows.length,
      })
    }
  }

  console.info("billing.free-plan.backfill.complete", {
    provisioned,
    totalUsers: rows.length,
  })
}

main().catch((error) => {
  console.error("billing.free-plan.backfill.failed", {
    message: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})

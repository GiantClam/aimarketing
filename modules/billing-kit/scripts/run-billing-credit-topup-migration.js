const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")
require("../../../scripts/load-env")
const { getMigrationPoolConfig } = require("../../../scripts/get-db-connection")

async function main() {
  const pool = new Pool(getMigrationPoolConfig())
  try {
    const sqlPath = path.join(__dirname, "..", "migrations", "add-billing-credit-topup-schema.sql")
    await pool.query(fs.readFileSync(sqlPath, "utf8"))
    console.log("Billing credit top-up migration completed successfully")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Billing credit top-up migration failed:", error)
  process.exit(1)
})

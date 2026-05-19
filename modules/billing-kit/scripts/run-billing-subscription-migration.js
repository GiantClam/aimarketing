const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")
require("../../../scripts/load-env")
const { getMigrationPoolConfig } = require("../../../scripts/get-db-connection")

async function main() {
  const pool = new Pool(getMigrationPoolConfig())

  try {
    const sqlPath = path.join(__dirname, "..", "migrations", "add-billing-subscription-schema.sql")
    const migrationSql = fs.readFileSync(sqlPath, "utf8")
    await pool.query(migrationSql)
    console.log("Billing subscription migration completed successfully")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Billing subscription migration failed:", error)
  process.exit(1)
})

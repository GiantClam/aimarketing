const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

async function main() {
  const pool = new Pool(getMigrationPoolConfig())

  try {
    const sqlPath = path.join(__dirname, "add-lead-hunter-evidence-schema.sql")
    const migrationSql = fs.readFileSync(sqlPath, "utf8")
    await pool.query(migrationSql)
    console.log("Lead Hunter evidence migration completed successfully")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Lead Hunter evidence migration failed:", error)
  process.exit(1)
})

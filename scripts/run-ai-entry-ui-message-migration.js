const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

async function main() {
  const pool = new Pool(getMigrationPoolConfig())

  try {
    const sqlPath = path.join(__dirname, "add-ai-entry-ui-message-schema.sql")
    await pool.query(fs.readFileSync(sqlPath, "utf8"))
    console.log("AI entry UI message migration completed successfully")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("AI entry UI message migration failed:", error)
  process.exit(1)
})

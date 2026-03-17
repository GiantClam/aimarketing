const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

async function main() {
  const pool = new Pool(getMigrationPoolConfig())

  try {
    const sqlPath = path.join(__dirname, "add-image-assistant-schema.sql")
    const migrationSql = fs.readFileSync(sqlPath, "utf8")
    await pool.query(migrationSql)
    console.log("Image assistant migration completed successfully")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Image assistant migration failed:", error)
  process.exit(1)
})

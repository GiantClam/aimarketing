const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")
require("./load-env")

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required")
  }

  const pool = new Pool({ connectionString })

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

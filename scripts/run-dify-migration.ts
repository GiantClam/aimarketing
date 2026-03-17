import { Pool } from "pg"

const TABLES = {
  users: "AI_MARKETING_users",
  difyConnections: "AI_MARKETING_dify_connections",
}

async function main() {
  const url =
    process.env.AI_MARKETING_DB_POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING
  const difyApiKey = process.env.DIFY_API_KEY || ""
  const difyBaseUrl = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1"
  if (!url) {
    throw new Error("AI_MARKETING_DB_POSTGRES_URL or fallback database URL is required")
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

  try {
    console.log("Creating core tables...")

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.users}" (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255),
        is_demo BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      INSERT INTO "${TABLES.users}" (id, email, name, is_demo)
      VALUES (1, 'demo@example.com', '演示用户', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.difyConnections}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        base_url TEXT NOT NULL,
        api_key VARCHAR(500),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    console.log("Inserting dify connections demo data...")
    await pool.query(
      `
        INSERT INTO "${TABLES.difyConnections}" (user_id, name, base_url, api_key, is_default)
        VALUES (1, 'Default Dify API', $1, $2, TRUE)
        ON CONFLICT DO NOTHING;
      `,
      [difyBaseUrl, difyApiKey],
    )

    console.log("Successfully ran Dify testing migration!")
  } catch (err) {
    console.error("Error executing SQL:", err)
  } finally {
    await pool.end()
  }
}

main()

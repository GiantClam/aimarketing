import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const difyApiKey = process.env.DIFY_API_KEY || "";
  const difyBaseUrl = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1";
  if (!url) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required");
  }
  const pool = new Pool({ connectionString: url });

  try {
    console.log("Creating core tables...");

    // Create users table matching schema.ts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255),
        is_demo BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert a demo user to act as user 1
    await pool.query(`
      INSERT INTO users (id, email, name, is_demo)
      VALUES (1, 'demo@example.com', '演示用户', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create dify_connections
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dify_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        base_url TEXT NOT NULL,
        api_key VARCHAR(500),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Inserting dify connections demo data...");
    await pool.query(`
      INSERT INTO dify_connections (user_id, name, base_url, api_key, is_default)
      VALUES (1, 'Default Dify API', $1, $2, TRUE)
      ON CONFLICT DO NOTHING;
    `, [difyBaseUrl, difyApiKey]);

    console.log("Successfully ran Dify testing migration!");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await pool.end();
  }
}

main();

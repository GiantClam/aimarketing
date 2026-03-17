const { Pool } = require("pg")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const FEATURE_KEYS = [
  "expert_advisor",
  "website_generation",
  "video_generation",
  "copywriting_generation",
]

const TABLES = {
  users: "AI_MARKETING_users",
  enterprises: "AI_MARKETING_enterprises",
  enterpriseJoinRequests: "AI_MARKETING_enterprise_join_requests",
  userFeaturePermissions: "AI_MARKETING_user_feature_permissions",
  userSessions: "AI_MARKETING_user_sessions",
  userFiles: "AI_MARKETING_user_files",
  n8nConnections: "AI_MARKETING_n8n_connections",
  tasks: "AI_MARKETING_tasks",
  difyConnections: "AI_MARKETING_dify_connections",
}

const INDEXES = {
  userFeaturePermissionsUserFeature: "AI_MARKETING_user_feature_permissions_user_feature_idx",
  userSessionsTokenHash: "AI_MARKETING_user_sessions_token_hash_idx",
}

async function main() {
  const pool = new Pool(getMigrationPoolConfig())

  try {
    await pool.query("BEGIN")

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.users}" (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255),
        is_demo BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.enterprises}" (
        id SERIAL PRIMARY KEY,
        enterprise_code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      ALTER TABLE "${TABLES.users}"
      ADD COLUMN IF NOT EXISTS enterprise_id INTEGER REFERENCES "${TABLES.enterprises}"(id);
    `)
    await pool.query(`
      ALTER TABLE "${TABLES.users}"
      ADD COLUMN IF NOT EXISTS enterprise_role VARCHAR(20) DEFAULT 'member';
    `)
    await pool.query(`
      ALTER TABLE "${TABLES.users}"
      ADD COLUMN IF NOT EXISTS enterprise_status VARCHAR(20) DEFAULT 'active';
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.enterpriseJoinRequests}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id),
        enterprise_id INTEGER NOT NULL REFERENCES "${TABLES.enterprises}"(id),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        note TEXT,
        reviewed_by INTEGER REFERENCES "${TABLES.users}"(id),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.userFeaturePermissions}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id),
        feature_key VARCHAR(100) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "${INDEXES.userFeaturePermissionsUserFeature}"
      ON "${TABLES.userFeaturePermissions}"(user_id, feature_key);
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.userSessions}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id),
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        ip_address VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "${INDEXES.userSessionsTokenHash}"
      ON "${TABLES.userSessions}"(token_hash);
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.userFiles}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id),
        file_name TEXT NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.n8nConnections}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id),
        name VARCHAR(255) NOT NULL,
        base_url TEXT NOT NULL,
        api_key VARCHAR(500),
        webhook_secret VARCHAR(500),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.tasks}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id),
        connection_id INTEGER REFERENCES "${TABLES.n8nConnections}"(id),
        workflow_name VARCHAR(255),
        webhook_path VARCHAR(255),
        execution_id VARCHAR(255),
        payload TEXT,
        result TEXT,
        status VARCHAR(30) DEFAULT 'pending',
        related_storage_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${TABLES.difyConnections}" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${TABLES.users}"(id),
        name VARCHAR(255) NOT NULL,
        base_url TEXT NOT NULL,
        api_key VARCHAR(500),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await pool.query(`
      INSERT INTO "${TABLES.enterprises}" (enterprise_code, name)
      VALUES ('experience-enterprise', '体验企业')
      ON CONFLICT (enterprise_code) DO NOTHING;
    `)

    const expEnt = await pool.query(
      `SELECT id FROM "${TABLES.enterprises}" WHERE enterprise_code = 'experience-enterprise' LIMIT 1;`,
    )
    const expEntId = expEnt.rows[0] && expEnt.rows[0].id

    if (expEntId) {
      await pool.query(
        `
          UPDATE "${TABLES.users}"
          SET enterprise_id = $1,
              enterprise_role = 'admin',
              enterprise_status = 'active',
              is_demo = TRUE,
              updated_at = CURRENT_TIMESTAMP
          WHERE email IN ('demo@example.com', 'demo@aimarketing.vercel.app');
        `,
        [expEntId],
      )
    }

    await pool.query(`
      INSERT INTO "${TABLES.enterprises}" (enterprise_code, name)
      VALUES ('default-enterprise', '默认企业')
      ON CONFLICT (enterprise_code) DO NOTHING;
    `)

    const defaultEnt = await pool.query(
      `SELECT id FROM "${TABLES.enterprises}" WHERE enterprise_code = 'default-enterprise' LIMIT 1;`,
    )
    const defaultEntId = defaultEnt.rows[0] && defaultEnt.rows[0].id

    if (defaultEntId) {
      await pool.query(
        `
          UPDATE "${TABLES.users}"
          SET enterprise_id = COALESCE(enterprise_id, $1),
              enterprise_role = COALESCE(enterprise_role, 'member'),
              enterprise_status = COALESCE(enterprise_status, 'active'),
              updated_at = CURRENT_TIMESTAMP
          WHERE enterprise_id IS NULL;
        `,
        [defaultEntId],
      )
    }

    const usersRes = await pool.query(`
      SELECT id, enterprise_role, enterprise_status
      FROM "${TABLES.users}"
      WHERE enterprise_id IS NOT NULL;
    `)

    for (const user of usersRes.rows) {
      const defaultEnabled = user.enterprise_role === "admin" && user.enterprise_status === "active"
      for (const featureKey of FEATURE_KEYS) {
        await pool.query(
          `
            INSERT INTO "${TABLES.userFeaturePermissions}" (user_id, feature_key, enabled)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, feature_key) DO NOTHING;
          `,
          [user.id, featureKey, defaultEnabled],
        )
      }
    }

    await pool.query("COMMIT")
    console.log("Enterprise migration completed successfully")
  } catch (error) {
    await pool.query("ROLLBACK")
    console.error("Enterprise migration failed:", error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()

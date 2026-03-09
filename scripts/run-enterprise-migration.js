const { Pool } = require('pg');
require('./load-env');

const FEATURE_KEYS = [
  'expert_advisor',
  'website_generation',
  'video_generation',
  'copywriting_generation',
];

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL is required');
  }

  const pool = new Pool({ connectionString });

  try {
    await pool.query('BEGIN');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS enterprises (
        id SERIAL PRIMARY KEY,
        enterprise_code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS enterprise_id INTEGER REFERENCES enterprises(id);
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS enterprise_role VARCHAR(20) DEFAULT 'member';
    `);
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS enterprise_status VARCHAR(20) DEFAULT 'active';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS enterprise_join_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        enterprise_id INTEGER NOT NULL REFERENCES enterprises(id),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        note TEXT,
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_feature_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        feature_key VARCHAR(100) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_feature_permissions_user_feature_idx
      ON user_feature_permissions(user_id, feature_key);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        ip_address VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_token_hash_idx
      ON user_sessions(token_hash);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        file_name TEXT NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS n8n_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        base_url TEXT NOT NULL,
        api_key VARCHAR(500),
        webhook_secret VARCHAR(500),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        connection_id INTEGER REFERENCES n8n_connections(id),
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
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dify_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        base_url TEXT NOT NULL,
        api_key VARCHAR(500),
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      INSERT INTO enterprises (enterprise_code, name)
      VALUES ('experience-enterprise', '体验企业')
      ON CONFLICT (enterprise_code) DO NOTHING;
    `);

    const expEnt = await pool.query(
      `SELECT id FROM enterprises WHERE enterprise_code = 'experience-enterprise' LIMIT 1;`
    );
    const expEntId = expEnt.rows[0] && expEnt.rows[0].id;

    if (expEntId) {
      await pool.query(`
        UPDATE users
        SET enterprise_id = $1,
            enterprise_role = 'admin',
            enterprise_status = 'active',
            is_demo = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE email IN ('demo@example.com', 'demo@aimarketing.vercel.app');
      `, [expEntId]);
    }

    await pool.query(`
      INSERT INTO enterprises (enterprise_code, name)
      VALUES ('default-enterprise', '默认企业')
      ON CONFLICT (enterprise_code) DO NOTHING;
    `);

    const defaultEnt = await pool.query(
      `SELECT id FROM enterprises WHERE enterprise_code = 'default-enterprise' LIMIT 1;`
    );
    const defaultEntId = defaultEnt.rows[0] && defaultEnt.rows[0].id;

    if (defaultEntId) {
      await pool.query(`
        UPDATE users
        SET enterprise_id = COALESCE(enterprise_id, $1),
            enterprise_role = COALESCE(enterprise_role, 'member'),
            enterprise_status = COALESCE(enterprise_status, 'active'),
            updated_at = CURRENT_TIMESTAMP
        WHERE enterprise_id IS NULL;
      `, [defaultEntId]);
    }

    const usersRes = await pool.query(`
      SELECT id, enterprise_role, enterprise_status
      FROM users
      WHERE enterprise_id IS NOT NULL;
    `);

    for (const user of usersRes.rows) {
      const defaultEnabled = user.enterprise_role === 'admin' && user.enterprise_status === 'active';
      for (const featureKey of FEATURE_KEYS) {
        await pool.query(`
          INSERT INTO user_feature_permissions (user_id, feature_key, enabled)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, feature_key) DO NOTHING;
        `, [user.id, featureKey, defaultEnabled]);
      }
    }

    await pool.query('COMMIT');
    console.log('Enterprise migration completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Enterprise migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

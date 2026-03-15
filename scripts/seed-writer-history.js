require("./load-env")

const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")

const ROOT = process.cwd()
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "writer-real-validation")
const WRITER_TITLE_PREFIX = "[writer] "

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex")
}

async function ensureWriterTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS writer_conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      platform VARCHAR(32) NOT NULL DEFAULT 'wechat',
      mode VARCHAR(32) NOT NULL DEFAULT 'article',
      language VARCHAR(32) NOT NULL DEFAULT 'auto',
      status VARCHAR(32) NOT NULL DEFAULT 'drafting',
      images_requested BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS writer_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES writer_conversations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
}

async function ensureDemoUser(pool) {
  let enterprise = await pool.query(
    `SELECT id FROM enterprises WHERE enterprise_code = 'experience-enterprise' LIMIT 1`,
  )

  if (enterprise.rowCount === 0) {
    enterprise = await pool.query(
      `INSERT INTO enterprises (enterprise_code, name, created_at, updated_at)
       VALUES ('experience-enterprise', '体验企业', NOW(), NOW())
       RETURNING id`,
    )
  }

  const enterpriseId = enterprise.rows[0].id
  let user = await pool.query(`SELECT id FROM users WHERE email = 'demo@example.com' LIMIT 1`)

  if (user.rowCount === 0) {
    user = await pool.query(
      `INSERT INTO users (
        name, email, password, enterprise_id, enterprise_role, enterprise_status, is_demo, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'admin', 'active', TRUE, NOW(), NOW())
      RETURNING id`,
      ["体验用户", "demo@example.com", hashPassword("demo123456"), enterpriseId],
    )
  } else {
    await pool.query(
      `UPDATE users
       SET name = $1,
           password = $2,
           enterprise_id = $3,
           enterprise_role = 'admin',
           enterprise_status = 'active',
           is_demo = TRUE,
           updated_at = NOW()
       WHERE id = $4`,
      ["体验用户", hashPassword("demo123456"), enterpriseId, user.rows[0].id],
    )
  }

  return user.rows[0].id
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required")
  }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

  const pool = new Pool({ connectionString })
  try {
    await ensureWriterTables(pool)
    const userId = await ensureDemoUser(pool)

    await pool.query(
      `DELETE FROM writer_conversations
       WHERE user_id = $1 AND title LIKE $2`,
      [userId, `${WRITER_TITLE_PREFIX}Cursor Validation Seed%`],
    )

    const title = `${WRITER_TITLE_PREFIX}Cursor Validation Seed ${Date.now()}`
    const insertedConversation = await pool.query(
      `INSERT INTO writer_conversations (
        user_id, title, platform, mode, language, status, images_requested, created_at, updated_at
      ) VALUES ($1, $2, 'wechat', 'article', 'zh', 'ready', FALSE, NOW(), NOW())
      RETURNING id`,
      [userId, title],
    )

    const conversationId = insertedConversation.rows[0].id
    const now = Date.now()

    for (let index = 1; index <= 25; index += 1) {
      const baseTime = new Date(now - (26 - index) * 120000)
      const answerTime = new Date(baseTime.getTime() + 15000)
      const turn = String(index).padStart(2, "0")

      await pool.query(
        `INSERT INTO writer_messages (conversation_id, role, content, created_at)
         VALUES ($1, 'user', $2, $3), ($1, 'assistant', $4, $5)`,
        [
          conversationId,
          `Cursor seed turn ${turn} question: 请给出第 ${turn} 轮内容工作流建议。`,
          baseTime,
          `Cursor seed turn ${turn} answer: 第 ${turn} 轮建议聚焦于工作流沉淀、团队协作和发布复盘。`,
          answerTime,
        ],
      )
    }

    await pool.query(
      `UPDATE writer_conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId],
    )

    const payload = {
      conversationId: String(conversationId),
      title: title.slice(WRITER_TITLE_PREFIX.length),
      turns: 25,
    }

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "seed.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    )
    console.log(JSON.stringify(payload))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

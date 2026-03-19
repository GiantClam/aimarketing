const crypto = require("crypto")
const { Pool } = require("pg")

require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const FEATURE_KEYS = [
  "expert_advisor",
  "website_generation",
  "video_generation",
  "copywriting_generation",
  "image_design_generation",
]

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex")
}

function parseArgs(argv) {
  const args = {
    email: "visual-regression@example.com",
    password: "VisualRegression123!",
    enterpriseCode: "experience-enterprise",
    name: "Visual Regression Admin",
    role: "admin",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === "--email" && next) args.email = next
    if (arg === "--password" && next) args.password = next
    if (arg === "--enterprise-code" && next) args.enterpriseCode = next
    if (arg === "--name" && next) args.name = next
    if (arg === "--role" && next) args.role = next
  }

  return args
}

async function upsertPermission(client, userId, featureKey, enabled) {
  await client.query(
    `
      INSERT INTO "AI_MARKETING_user_feature_permissions" (user_id, feature_key, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id, feature_key)
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
    `,
    [userId, featureKey, enabled],
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pool = new Pool(getMigrationPoolConfig())

  try {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      const enterpriseRes = await client.query(
        `
          SELECT id, enterprise_code, name
          FROM "AI_MARKETING_enterprises"
          WHERE enterprise_code = $1
          LIMIT 1
        `,
        [String(args.enterpriseCode).trim().toLowerCase()],
      )

      const enterprise = enterpriseRes.rows[0]
      if (!enterprise) {
        throw new Error(`enterprise_not_found:${args.enterpriseCode}`)
      }

      const normalizedEmail = String(args.email).trim().toLowerCase()
      const passwordHash = hashPassword(String(args.password))

      const existingRes = await client.query(
        `
          SELECT id
          FROM "AI_MARKETING_users"
          WHERE email = $1
          LIMIT 1
        `,
        [normalizedEmail],
      )

      let userId = existingRes.rows[0]?.id || null
      if (userId) {
        await client.query(
          `
            UPDATE "AI_MARKETING_users"
            SET
              name = $2,
              password = $3,
              enterprise_id = $4,
              enterprise_role = $5,
              enterprise_status = 'active',
              is_demo = FALSE,
              updated_at = NOW()
            WHERE id = $1
          `,
          [userId, args.name, passwordHash, enterprise.id, args.role],
        )
      } else {
        const insertRes = await client.query(
          `
            INSERT INTO "AI_MARKETING_users"
              (name, email, password, enterprise_id, enterprise_role, enterprise_status, is_demo, created_at, updated_at)
            VALUES
              ($1, $2, $3, $4, $5, 'active', FALSE, NOW(), NOW())
            RETURNING id
          `,
          [args.name, normalizedEmail, passwordHash, enterprise.id, args.role],
        )
        userId = insertRes.rows[0]?.id
      }

      if (!userId) {
        throw new Error("visual_regression_user_upsert_failed")
      }

      for (const featureKey of FEATURE_KEYS) {
        await upsertPermission(client, userId, featureKey, true)
      }

      await client.query("COMMIT")

      console.log(
        JSON.stringify(
          {
            ok: true,
            user: {
              id: userId,
              email: normalizedEmail,
              password: args.password,
              name: args.name,
              role: args.role,
            },
            enterprise: {
              id: enterprise.id,
              code: enterprise.enterprise_code,
              name: enterprise.name,
            },
            permissions: FEATURE_KEYS.reduce((acc, key) => {
              acc[key] = true
              return acc
            }, {}),
          },
          null,
          2,
        ),
      )
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

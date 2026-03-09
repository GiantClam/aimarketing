const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('./load-env');

async function main() {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
        console.error("No DATABASE_URL found in .env");
        process.exit(1);
    }
    const difyApiKey = process.env.DIFY_API_KEY || "";
    const difyBaseUrl = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1";

    const pool = new Pool({
        connectionString: url,
    });

    try {
        const sqlPath = path.join(__dirname, 'add-dify-connections-schema.sql');
        let sql = fs.readFileSync(sqlPath, 'utf8');

        // Inject runtime config instead of committing credentials into the repo.
        sql = sql.replace("''", difyApiKey ? `'${difyApiKey.replace(/'/g, "''")}'` : "''");
        sql = sql.replace("'https://api.dify.ai/v1'", `'${difyBaseUrl.replace(/'/g, "''")}'`);

        console.log("Executing SQL...");
        await pool.query(sql);
        console.log("Successfully ran add-dify-connections-schema.sql");
    } catch (err) {
        console.error("Error executing SQL:", err);
    } finally {
        await pool.end();
    }
}

main();

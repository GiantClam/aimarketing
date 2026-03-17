const { neon } = require('@neondatabase/serverless');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex < 0) return;
  const key = trimmed.slice(0, eqIndex).trim();
  const val = trimmed.slice(eqIndex + 1).trim();
  if (!process.env[key]) process.env[key] = val;
});

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  
  const admins = await sql`
    SELECT e.id as enterprise_id, e.enterprise_code, e.name as enterprise_name,
           u.id as user_id, u.email, u.name as user_name, u.password,
           u.enterprise_role, u.enterprise_status
    FROM enterprises e
    JOIN users u ON u.enterprise_id = e.id AND u.enterprise_role = 'admin'
    WHERE e.name ILIKE ${'%灵创%'} OR e.name ILIKE ${'%VBUY%'}
    ORDER BY e.name, u.id
  `;
  
  const output = [];
  for (const row of admins) {
    output.push('---');
    output.push('Enterprise: ' + row.enterprise_name + ' (ID: ' + row.enterprise_id + ', Code: ' + row.enterprise_code + ')');
    output.push('User: ' + row.user_name + ' (ID: ' + row.user_id + ')');
    output.push('Email: ' + row.email);
    output.push('Password: ' + row.password);
    output.push('Role: ' + row.enterprise_role);
    output.push('Status: ' + row.enterprise_status);
  }
  output.push('---');
  output.push('Total: ' + admins.length + ' admin accounts found');
  
  fs.writeFileSync(path.resolve(__dirname, '_tmp_result.txt'), output.join('\n'), 'utf-8');
  console.log('Results written to _tmp_result.txt');
}

main().catch(e => console.error('Error:', e.message));

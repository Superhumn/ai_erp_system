import mysql from 'mysql2/promise';
import 'dotenv/config';

async function cleanup() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log("Cleaning up junk CRM contacts...\n");

  const [rows] = await conn.execute("SELECT COUNT(*) as cnt FROM crm_contacts") as any;
  console.log(`Total contacts: ${rows[0].cnt}`);

  // Delete "Contact Form" entries with no email
  const [r1] = await conn.execute("DELETE FROM crm_contacts WHERE fullName = 'Contact Form'") as any;
  console.log(`Deleted ${r1.affectedRows} "Contact Form" contacts`);

  // Delete contacts with name like phone numbers and no email
  const [r2] = await conn.execute("DELETE FROM crm_contacts WHERE fullName REGEXP '^[0-9 \\-\\(\\)\\+]+$' AND (email IS NULL OR email = '')") as any;
  console.log(`Deleted ${r2.affectedRows} phone-number-only contacts`);

  // Delete contacts with no name and no email
  const [r3] = await conn.execute("DELETE FROM crm_contacts WHERE (fullName IS NULL OR fullName = '' OR fullName = '-') AND (email IS NULL OR email = '')") as any;
  console.log(`Deleted ${r3.affectedRows} empty contacts`);

  const [remaining] = await conn.execute("SELECT COUNT(*) as cnt FROM crm_contacts") as any;
  console.log(`\nRemaining contacts: ${remaining[0].cnt}`);

  await conn.end();
  process.exit(0);
}

cleanup().catch(err => { console.error(err); process.exit(1); });

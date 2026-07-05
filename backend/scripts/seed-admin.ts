// Bootstrap the first admin user. Run after `pnpm db:migrate`.
// Reads DATABASE_URL and SEEDED_ADMIN_PASSWORD from `.dev.vars` (or process env).
//
// usage: pnpm seed:admin <email> [name]

import { config } from 'dotenv';
config({ path: '.dev.vars' });

import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/modules/database/schema';

const usage = 'usage: pnpm seed:admin <email> [name]   (password is read from SEEDED_ADMIN_PASSWORD)';

const main = async () => {
  const [email, name = 'Admin'] = process.argv.slice(2);
  if (!email) {
    console.error(usage);
    process.exit(1);
  }

  const password = process.env.SEEDED_ADMIN_PASSWORD;
  if (!password) {
    console.error('SEEDED_ADMIN_PASSWORD is not set (check `.dev.vars`).');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (check `.dev.vars`).');
    process.exit(1);
  }

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing[0]) {
    console.error(`A user with email "${email}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [row] = await db
    .insert(schema.users)
    .values({ email, name, passwordHash, role: 'admin' })
    .returning({ id: schema.users.id, email: schema.users.email, role: schema.users.role });

  console.log(`Seeded admin user ${row.email} (id ${row.id}, role ${row.role})`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

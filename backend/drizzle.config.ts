import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

config({ path: '.dev.vars' });

export default {
  schema: './src/modules/database/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
} satisfies Config;

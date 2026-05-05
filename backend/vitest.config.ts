import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// Tests run inside the Workers runtime via miniflare. Bindings + secrets are read
// from `wrangler.toml` and `.dev.vars` — including DATABASE_URL, which means the
// suite hits the live Neon DB. Email/recipient policy:
//   - users.email fixtures use `test+<scope>-<rand>@penanevadachillers.com`. Users
//     never receive email from this app, so a non-existent address can't bounce.
//   - customers.email fixtures use `dasom.mx+<scope>-<rand>@gmail.com`. Resend is
//     mocked in `pnpm test`, but the Gmail `+`-alias keeps these deliverable as a
//     defense-in-depth guard against an accidentally-unmocked real send.
//   - Both can be wiped at release via `DELETE … WHERE email LIKE 'test+%'`
//     (users) and `email LIKE 'dasom.mx+test-%@gmail.com'` (customers).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

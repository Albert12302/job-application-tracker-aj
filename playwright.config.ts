import { execFileSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// e2e/security.spec.ts talks to Supabase directly with the anon key, exactly as
// the browser holds it. Those values live in .env.local (gitignored), which the
// Vite dev server reads but a Playwright worker does not.
Object.assign(process.env, loadEnv('development', process.cwd(), 'VITE_'))

/**
 * The local service-role key, for the one spec that needs it: account deletion
 * destroys the account it runs as, so it creates a throwaway user per test
 * (e2e/throwaway-user.ts) instead of borrowing a seed one.
 *
 * Resolved once, here, and inherited by every worker. Asking per worker meant
 * six concurrent `supabase` CLI invocations — which stop containers as a side
 * effect — in the middle of the run, and that was enough to skew the response
 * timings e2e/sign-in-function.spec.ts measures for §7.1 account enumeration.
 *
 * `supabase status` can only answer about the stack on this machine, so no
 * hosted key can reach the tests this way.
 */
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const status = JSON.parse(
      execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] }),
    ) as Record<string, string>
    if (status.SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY
  } catch {
    // Only the deletion spec needs it, and it fails with its own message.
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // SPEC §12: every browser on iOS is WebKit, so it is a first-class target.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})

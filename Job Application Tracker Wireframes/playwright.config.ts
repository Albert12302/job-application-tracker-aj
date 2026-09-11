import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// e2e/security.spec.ts talks to Supabase directly with the anon key, exactly as
// the browser holds it. Those values live in .env.local (gitignored), which the
// Vite dev server reads but a Playwright worker does not.
Object.assign(process.env, loadEnv('development', process.cwd(), 'VITE_'))

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

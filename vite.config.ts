import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

type VercelConfig = { headers?: { headers: { key: string; value: string }[] }[] }

/**
 * The CSP from vercel.json, enforced, for `npm run preview` (SPEC §7.5). Read
 * from vercel.json rather than copied, so what is checked locally is what
 * ships. The hosted Supabase origin (placeholder or real ref) becomes the
 * local one, or every request from the preview would be refused.
 */
function previewCsp(supabaseUrl: string | undefined): string | undefined {
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as VercelConfig
  const policy = vercel.headers
    ?.flatMap((rule) => rule.headers)
    .find((header) => /^Content-Security-Policy(-Report-Only)?$/.test(header.key))?.value
  if (!policy || !supabaseUrl) return policy

  const local = new URL(supabaseUrl)
  const wsScheme = local.protocol === 'https:' ? 'wss:' : 'ws:'
  return policy
    .replace(/https:\/\/[\w-]+\.supabase\.co/g, local.origin)
    .replace(/wss:\/\/[\w-]+\.supabase\.co/g, `${wsScheme}//${local.host}`)
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const csp = previewCsp(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Preview only: the dev server's hot reload injects inline scripts the policy blocks.
    preview: csp ? { headers: { 'Content-Security-Policy': csp } } : {},
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // e2e/ belongs to Playwright; Vitest owns only co-located unit and
      // component tests (CLAUDE.md "Testing").
      // Plus the edge function's pure limit logic, which has no Deno APIs.
      include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
      css: true,
      coverage: {
        provider: 'v8',
        include: ['src/domain/**', 'src/services/**'],
      },
    },
  }
})

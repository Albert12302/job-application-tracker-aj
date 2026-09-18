import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

type VercelConfig = { headers?: { headers: { key: string; value: string }[] }[] }

/** The enforced CSP in vercel.json — never a `-Report-Only` one, which enforces nothing (SPEC §7.5). */
function shippedCsp(): string | undefined {
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as VercelConfig
  return vercel.headers?.flatMap((rule) => rule.headers).find((header) => header.key === 'Content-Security-Policy')
    ?.value
}

/**
 * Fails a Vercel build (`VERCEL=1`) whose CSP would not protect the deployed app
 * (SPEC §7.5): missing or report-only, still holding the placeholder ref, or
 * naming a different Supabase project than the one the bundle calls. An enforced
 * CSP is the condition that makes localStorage tokens acceptable, so it is a
 * build failure rather than a README step. Local builds are not checked.
 */
function assertReleaseCsp(policy: string | undefined, supabaseUrl: string | undefined): void {
  if (!policy) refuseRelease('no enforced Content-Security-Policy header (a -Report-Only one does not count)')
  if (policy.includes('YOUR_PROJECT_REF')) refuseRelease('still holds the YOUR_PROJECT_REF placeholder')
  if (!supabaseUrl) refuseRelease('VITE_SUPABASE_URL is not set in the Vercel project')
  const host = new URL(supabaseUrl).host
  // Every Supabase origin in every directive, whole host only: one directive left
  // naming another project would pass a check that the right host appears somewhere.
  const named = [...policy.matchAll(/(https|wss):\/\/([\w.-]+\.supabase\.co)(?=[\s;]|$)/g)]
  const other = named.find(([, , namedHost]) => namedHost !== host)
  if (other) refuseRelease(`names ${other[0]}, but VITE_SUPABASE_URL points at ${host}`)
  for (const scheme of ['https', 'wss']) {
    if (!named.some(([, namedScheme]) => namedScheme === scheme)) {
      refuseRelease(`does not allow ${scheme}://${host}, the Supabase project VITE_SUPABASE_URL points at`)
    }
  }
}

function refuseRelease(problem: string): never {
  throw new Error(`vercel.json CSP: ${problem} — see README.md, Deploy → Vercel (SPEC §7.5).`)
}

/**
 * The shipped CSP, enforced, for `npm run preview` (SPEC §7.5). Read from
 * vercel.json rather than copied, so what is checked locally is what ships.
 * The hosted Supabase origin (placeholder or real ref) becomes the local one,
 * or every request from the preview would be refused.
 */
function previewCsp(policy: string | undefined, supabaseUrl: string | undefined): string | undefined {
  if (!policy || !supabaseUrl) return policy

  const local = new URL(supabaseUrl)
  const wsScheme = local.protocol === 'https:' ? 'wss:' : 'ws:'
  return policy
    .replace(/https:\/\/[\w-]+\.supabase\.co/g, local.origin)
    .replace(/wss:\/\/[\w-]+\.supabase\.co/g, `${wsScheme}//${local.host}`)
}

/**
 * The version every error report carries (`services/report-error.ts`, SPEC §7.7): the
 * commit being built. Vercel hands each build `VERCEL_GIT_COMMIT_SHA`, but not as a
 * `VITE_` variable, and a dashboard value of `$VERCEL_GIT_COMMIT_SHA` would arrive as
 * that literal text — so it is read here. An explicit `VITE_RELEASE` still wins; a
 * local build has neither and reports none.
 */
function releaseDefine(explicit: string | undefined): Record<string, string> {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA
  return !explicit && commit ? { 'import.meta.env.VITE_RELEASE': JSON.stringify(commit) } : {}
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const supabaseUrl = env.VITE_SUPABASE_URL
  const policy = shippedCsp()
  if (process.env.VERCEL) assertReleaseCsp(policy, supabaseUrl)
  const csp = previewCsp(policy, supabaseUrl)

  return {
    plugins: [react(), tailwindcss()],
    define: releaseDefine(env.VITE_RELEASE),
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Preview only: the dev server's hot reload injects inline scripts the policy blocks.
    preview: csp ? { headers: { 'Content-Security-Policy': csp } } : {},
    test: {
      // Fixed stand-ins, so no unit test depends on a gitignored .env.local.
      // data/client.ts throws at import time without these, so a test that
      // imports something under data/ for real — rather than mocking it — passes
      // on a machine that has run the app and fails in CI. Nothing in the unit
      // suite should make a request, and if one ever does it must fail rather
      // than reach a database: .invalid is reserved (RFC 2606) and never resolves,
      // where the local stack's address would quietly answer while it is running.
      env: {
        VITE_SUPABASE_URL: 'http://unit-tests.invalid',
        VITE_SUPABASE_ANON_KEY: 'unit-test-anon-key',
      },
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

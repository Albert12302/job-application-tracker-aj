# Job Application Tracker

Personal tracker for job applications. One repo, one app.

- **`SPEC.md`** — what the product does. Read before any change; §7 is non-negotiable.
- **`CLAUDE.md`** — how it gets built. Stack, structure, conventions, definition of done.
- **`Job Tracker Prototype.dc.html`** — interactive prototype. Behavior and visual reference,
  not architecture.

## Why one repo and not a workspace monorepo

Everything ships together: one React app, one Supabase project, one edge function, one test
suite. Workspaces buy isolated dependency trees and independent versioning, which matter when
two deployables share a library. There is one deployable.

`src/domain/` is written to import nothing from the rest of `src/` (enforced by review — see
CLAUDE.md). If a second consumer ever appears — a mobile client, or edge functions doing real
schema validation — that directory becomes `packages/domain` by moving it, not by untangling
it. Until then the indirection is cost without benefit.

## Bootstrap

The generated tooling is deliberately not committed pre-made: `npm create vite` and
`shadcn init` produce current, correct config, and a hand-written approximation of them pins
stale versions. Run them, then merge in the decisions this repo already made.

```bash
# 1. App scaffold
npm create vite@latest . -- --template react-ts

# 2. Tailwind + shadcn (init writes the Tailwind and path-alias config)
npx shadcn@latest init

# 3. Routing, data, forms, validation
npm i @tanstack/react-router @tanstack/react-query zod react-hook-form \
      @hookform/resolvers @supabase/supabase-js sonner

# 4. Testing
npm i -D vitest @vitest/coverage-v8 jsdom @testing-library/react \
        @testing-library/user-event @playwright/test axe-core @axe-core/playwright
npx playwright install --with-deps

# 5. Supabase — config.toml and migrations are already committed.
#    Do NOT run `supabase init` over them.
npx supabase start
npx supabase db reset
cp .env.example .env.local        # paste the local URL + anon key that `start` printed
npx supabase functions serve sign-in --env-file .env.local

# 6. Point tsconfig.app.json at the strict options:
#    "extends": "./tsconfig.strict.json"

npm run dev
```

### Scripts that must exist

Add these to the generated `package.json`. CLAUDE.md and CI both assume all eight.

| script | command |
|---|---|
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `test` | `vitest run` |
| `test:e2e` | `playwright test` |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit` |
| `db:reset` | `supabase db reset` |
| `db:types` | `supabase gen types typescript --local > src/data/database.types.ts` |

## Local accounts

`seed.sql` creates two, both with password `devpassword1234`:

- `dev-a@example.test` — applications, notes, and status history
- `dev-b@example.test` — owns one application, and exists so the §7.8 cross-user isolation
  tests have a second account without a manual setup step

Signup is disabled in `config.toml` (`enable_signup = false`), matching the launch decision in
SPEC §4.1d. Create accounts via seed or Studio.

## Before the first feature

`e2e/security.spec.ts` holds the checks SPEC §7.8 requires as tests. They fail until the
schema is applied and the app exists — that is correct. Get them passing as part of the
features they cover, never by weakening an assertion.

## Deploy

**Vercel (Hobby) + Supabase (Free).** Both free, neither requires a card, and Hobby's terms
are non-commercial — which this is.

GitHub Pages was considered and rejected: it cannot set HTTP response headers, so CSP, HSTS,
`Referrer-Policy`, and `Permissions-Policy` (SPEC §7.5) are unshippable there. A `<meta>` CSP
covers only part of the policy — `frame-ancestors` and HSTS exist as headers or not at all.
Vercel's `vercel.json` handles all of it; Cloudflare Pages and Netlify do the same via
`_headers` if you'd rather.

### Supabase, hosted

```bash
npx supabase link --project-ref <ref>
npx supabase db push                       # applies migrations/ to the hosted project
npx supabase functions deploy sign-in
npx supabase secrets set SIGN_IN_HASH_PEPPER="$(openssl rand -hex 32)"
```

Then, in the dashboard: add the Vercel URL to **Auth → URL Configuration** (site URL and
redirect allowlist), or every verification and reset link bounces.

Do **not** run `db reset` against the hosted project — it drops everything. `db push` only
applies what is new.

`config.toml` settings do not all sync on push; confirm the §7.1 auth values (JWT expiry,
password minimum, `enable_signup`, rate limits) in the dashboard after linking, and change
them in the file rather than the UI from then on.

`enable_signup` is `false`. The deployed app therefore has no way to create your account —
add it in the dashboard (Auth → Users → Add user, with "auto confirm"), or flip the flag,
deploy, sign up, and flip it back.

### Vercel

`vercel.json` is committed with the SPA rewrite and the §7.5 headers. Two edits before it
means anything:

1. Replace both `YOUR_PROJECT_REF` placeholders with the hosted project ref, or every request
   is blocked once the CSP is enforced.
2. The CSP ships as `Content-Security-Policy-Report-Only` (§7.5: report-only first). Rename
   the key to `Content-Security-Policy` once the console is clean. Do not disable it when it
   breaks something — fix the directive.

Environment variables in the Vercel project: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
and `VITE_RELEASE` (set to `$VERCEL_GIT_COMMIT_SHA`). Nothing else. `SIGN_IN_HASH_PEPPER` and
the service role key live only in Supabase — a `VITE_` prefix puts a value in the public
bundle (§7.4).

### The free-tier behavior to expect

Free Supabase projects **pause after 7 days with no database activity**, and resuming takes
about 30 seconds on the first request. Data survives it. For a tracker opened every few weeks
this is normal, not a fault — either accept the cold start or point a free uptime monitor at
the project. It is not worth $25/month to avoid a 30-second wait.

Adding no payment card to either service is what guarantees no bill: both cap or pause rather
than invoice. Crossing a Supabase limit returns 402 until the period resets.

### Post-deploy, once

Run the §7.8 hand checks against the deployed app, not just locally — item 2 in particular
(grep the built bundle for anything that is not the anon key), and item 3 (confirm a signed
URL expires and the bucket is not publicly listable).

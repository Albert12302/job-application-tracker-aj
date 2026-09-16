# Job Application Tracker

Personal tracker for job applications. One repo, one app.

- **`SPEC.md`** — what the product does. Read before any change; §7 is non-negotiable.
- **`CLAUDE.md`** — how it gets built. Stack, structure, conventions, definition of done.
- **`Job Tracker Prototype.dc.html`** — interactive prototype. Behavior and visual reference,
  not architecture.

## Why one repo and not a workspace monorepo

Everything ships together: one React app, one Supabase project and its edge functions, one
test suite. Workspaces buy isolated dependency trees and independent versioning, which matter when
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
npx supabase functions serve --env-file supabase/functions/.env.local   # every function; pepper + ALLOWED_ORIGINS, never the app's .env.local

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
| `typecheck` | `tsc -b --noEmit` |
| `db:reset` | `supabase db reset` |
| `db:types` | `supabase gen types typescript --local > src/data/database.types.ts` |

## Local accounts

`seed.sql` creates three, all with password `devpassword1234`:

- `dev-a@example.test` — applications, notes, and status history
- `dev-b@example.test` — owns one application, and exists so the §7.8 cross-user isolation
  tests have a second account without a manual setup step
- `dev-c@example.test` — owns nothing; `e2e/sign-in-function.spec.ts` locks it out on purpose.
  A lockout lasts 15 minutes, so no other test may sign in as it. `db:reset` unlocks it.

Signup is disabled in `config.toml` (`enable_signup = false`), matching the launch decision in
SPEC §4.1d. Create accounts via seed or Studio.

## Before the first feature

`e2e/security.spec.ts` holds the checks SPEC §7.8 requires as tests. They fail until the
schema is applied and the app exists — that is correct. Get them passing as part of the
features they cover, never by weakening an assertion.

## CI

`.github/workflows/ci.yml` runs on every push to `master` and every pull request: typecheck,
lint, the unit suite **in two timezones**, and the build. `.github/dependabot.yml` proposes
dependency updates weekly, grouped so they stay reviewable.

The second timezone is the point, not thoroughness for its own sake. `date_applied` is stored
at UTC midnight and formatted in UTC everywhere (SPEC §5.4); rendered in local time it shows
the previous day west of Greenwich, and nowhere east of it — so a UTC-only runner proves
nothing. The job asserts the zone actually applied before running the suite, because a `TZ`
that silently falls back leaves the suite green having tested nothing. (That is not
hypothetical: on Windows `TZ=America/Los_Angeles` is ignored — use `TZ=PST8PDT` locally.)

The vulnerability scan (§7.6) is blocking for runtime dependencies, which ship to the browser,
and report-only for dev dependencies, which do not — an unfixable advisory in a test tool
should not stop all work.

**The Playwright suite is not in CI yet.** It needs the whole Supabase stack on the runner,
and the §7.1 sign-in timing check fails about half of full local runs for reasons of load
rather than correctness. A pipeline that is red half the time teaches people to ignore it.
Fix that test, then add the job.

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
npx supabase functions deploy upload          # the only way files reach Storage (§7.3)
npx supabase functions deploy delete-account  # the only thing that can remove an auth.users row (§9.7)
npx supabase secrets set SIGN_IN_HASH_PEPPER="$(openssl rand -hex 32)"
npx supabase secrets set ALLOWED_ORIGINS="https://<your-app>.vercel.app"   # without it, browser sign-in fails CORS
# Never set SIGN_IN_IP_MAX_FAILURES here — it is local-only; unset means the §7.1 limit of 20.
```

Then, in the dashboard: add the Vercel URL to **Auth → URL Configuration** (site URL and
redirect allowlist), or every verification and reset link bounces.

Do **not** run `db reset` against the hosted project — it drops everything. `db push` only
applies what is new.

**Never pass `--include-seed` to `db push`, and never `db reset --linked`.** Both run
`seed.sql` against the hosted project, creating `dev-a` / `dev-b` / `dev-c` with a password,
emails, and user ids that are published in this repo for anyone to read. Plain
`db push` applies migrations only and is the only form you need. Your own account goes
in by hand in the dashboard, with a password from a password manager.

`config.toml` settings do not all sync on push. After linking, confirm these §7.1 auth values
in the dashboard, and from then on change them in the file rather than the UI:

- JWT expiry 3600 s. Refresh-token rotation on, reuse interval 10 s.
- Password minimum 12. `enable_signup` off.
- Email confirmations on. Secure password change on. Email OTP / link expiry 3600 s.
- Rate limits (`[auth.rate_limit]`).
- **Sessions:** the dashboard's time-box and inactivity timeout are Pro-only. Leave them
  unset. On the Free plan, the `expire-sessions` pg_cron job enforces §7.1's 90-day cap and
  14-day idle limit instead. It arrives with `db push`.

**Then check that the session job can actually delete, hosted.** It depends on `postgres`
keeping its DELETE grant on `auth.sessions`, a Supabase-managed table. An hour after
`db push`, run this in the SQL editor:

```sql
select d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j using (jobid)
 where j.jobname = 'expire-sessions'
 order by d.start_time desc limit 3;
```

Expect `succeeded` with `DELETE 0` (or a count). A `failed` row saying `permission denied`
means sessions never expire hosted, and §7.1 is unmet. Fix that before any real data goes in.
`select jobname, schedule from cron.job;` should list `expire-sessions`,
`purge-cron-run-details` and `purge-old-logs`.

`enable_signup` is `false`. The deployed app therefore has no way to create your account —
add it in the dashboard (Auth → Users → Add user, with "auto confirm"), or flip the flag,
deploy, sign up, and flip it back.

### Backups

SPEC §7.6 wants point-in-time recovery before real user data exists. PITR and daily backups
are **paid** Supabase features, and no payment card goes on either service — that rule is what
guarantees this project cannot generate a bill. So the requirement is met the other way:
`.github/workflows/backup.yml` dumps the hosted database every night and keeps the dump as a
build artifact for 90 days.

**The dump is encrypted, and that is not optional.** This repository is public, and workflow
artifacts on a public repository can be downloaded by anyone who can read the repo. An
unencrypted dump would publish every application, note and email address in the database. It
is encrypted on the runner with an `age` **public** key, so CI can write a backup it cannot
itself read and the private key never exists in GitHub.

Set up once:

```bash
age-keygen -o backup-key.txt     # keep this file in a password manager, never in the repo
```

- Repository **variable** `BACKUP_AGE_RECIPIENT` — the `age1…` public key. Not a secret.
- Repository **secret** `SUPABASE_DB_URL` — the hosted Postgres connection string.

Until both exist the job skips with a notice instead of failing nightly. Restore with:

```bash
age -d -i backup-key.txt -o backup.tar.gz backup-YYYY-MM-DD.tar.gz.age
tar xzf backup.tar.gz            # schema.sql, then data.sql
```

§7.6 also says to **test a restore at least once**. Do it against a scratch local database
before trusting it — an untested backup is a hope, not a backup.

### Vercel

The app lives at the repository root, so Vercel's defaults apply and no "Root Directory"
needs setting.

`vercel.json` is committed with the SPA rewrite and the §7.5 headers. Two edits before it
means anything:

1. Replace both `YOUR_PROJECT_REF` placeholders with the hosted project ref, or every request
   is blocked once the CSP is enforced.
2. The CSP ships as `Content-Security-Policy-Report-Only` (§7.5: report-only first). Rename
   the key to `Content-Security-Policy` once the console is clean. Do not disable it when it
   breaks something — fix the directive.

   **Enforcing it is a release blocker, not a follow-up:** session tokens live in
   localStorage (an accepted risk, SPEC §7.5), and the enforced CSP is the condition that
   makes that acceptable. No real user data goes in while the header still says
   `-Report-Only`.

   Check the policy locally before each deploy — it catches most breakage without a round
   trip to Vercel:

   ```bash
   npm run build && npm run preview     # http://localhost:4173, CSP enforced
   ```

   `vite.config.ts` reads the policy straight out of this file and swaps the hosted Supabase
   origin for the local one, so the preview enforces exactly what ships. Sign in, open the
   profile, upload a photo, and watch the console for `Refused to …` errors. (The dev server
   cannot run under it: hot reload injects inline scripts the policy blocks.)

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

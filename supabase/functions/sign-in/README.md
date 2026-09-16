# sign-in

The only pre-auth endpoint. Owns both sign-in limits (SPEC §7.1):

- **per account** — cannot live in a database trigger (a failed sign-in has no session to
  attribute a write to);
- **per IP** — cannot live in `config.toml`, because behind this function Auth sees one
  caller for every sign-in: the function. Only the function sees the user's address.

Both are checked before Auth is called, so a blocked caller never reaches Auth — and never
drains Auth's own limit, which behind this function is one bucket shared by every user.

## Contract

`POST /functions/v1/sign-in` with `{ email, password }`.

| response | meaning |
|---|---|
| `200 { session }` | pass to `supabase.auth.setSession(session)` |
| `400 { error }` | a field was empty — the only specific message |
| `401 { error }` | generic failure copy, identical for wrong password and unknown email |
| `429 { error, retryAfterMinutes }` | account locked, address blocked, or Auth's own limit tripped — the body never says which; `retryAfterMinutes` is the wait, and the client shows it |
| `503 { error }` | Auth or the lockout counter unavailable — nothing was counted |

The client maps these statuses to its own copy (`src/features/auth/SignInForm.tsx`); the
`error` strings are for curl, not for rendering.

Every response takes at least 1 s (`MIN_RESPONSE_MS`). The floor must stay above the
function's real work, or it pads nothing and the password-hash check only a real account
costs becomes measurable — the timing test in the e2e suite is what notices.

Account lockout: five failures inside one 15-minute window lock the account for 15 minutes
from the fifth. Before that, each attempt waits 250 ms × 2^(failures − 1). Unknown emails are
counted by the same hash, so they back off and lock exactly like real ones.

Address block: 20 failures from one address inside an hour block it until the oldest of them
is an hour old, whatever account it tries. A success clears the account's failures, never the
address's. The decisions live in `limits.ts` — pure, no Deno APIs — and `limits.test.ts`
covers them under Vitest (`npm test`).

Concurrency: the counts come from `begin_sign_in_attempt` (migration `20260916181344`), which
locks the account and address hashes, reads their recent failures, and inserts this attempt as
`pending` in one transaction. Pending rows count as failures, so simultaneous attempts see each
other. Every path then settles its own row: `failure` or `success`, or deleted when blocked or
when Auth is rate-limited or down. Never go back to reading the counts with plain selects — the
check and the record would separate again, and parallel guesses would all read the same count.

What this does **not** cover: Auth's password endpoint is public to the anon key, and a direct
call skips this function entirely. That is an accepted risk (SPEC §7.1), revisited before
sign-up opens.

## Confirm the client IP after deploy

The address comes from `x-real-ip`, falling back to the **last** `x-forwarded-for` entry
(`limits.ts` `clientIp`). Locally both are written by Kong, and a client-sent value never
survives — measured, not assumed. On the hosted project, confirm it once (SPEC §7.8 check 7):
fail one sign-in from home Wi-Fi and one from a phone on cellular, then, the same day (rows are
purged after 24 hours)

```sql
select ip_hash, count(*) from public.sign_in_attempts where outcome = 'failure' group by 1;
```

Two hashes: correct. One hash: the function is seeing a proxy's address, every user shares
one bucket again, and `clientIp` needs the header Supabase's edge sets for the real caller.

## Secrets

```bash
supabase secrets set SIGN_IN_HASH_PEPPER="$(openssl rand -hex 32)"
supabase secrets set ALLOWED_ORIGINS="https://<your-app>.vercel.app"
```

Locally both go in `supabase/functions/.env.local` (gitignored), served with
`--env-file supabase/functions/.env.local`.

`SIGN_IN_IP_MAX_FAILURES` exists for local development only, where every request reaches the
function from one Docker address and a single e2e run would otherwise block the next for an
hour; the local env file sets 200. **Never set it on the hosted project** — unset means the
§7.1 value of 20, and anything unparseable falls back to 20 rather than disabling the limit.

`ALLOWED_ORIGINS` is a comma-separated allowlist for CORS (§7.5): an allowed origin is echoed,
anything else gets no `Access-Control-Allow-Origin` at all — never `*`. Hosted Supabase adds no
CORS headers to functions, so without it the browser cannot sign in.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the
platform. The service role key exists **only** in this function's runtime — never in the
client bundle, never in a `VITE_*` var (§7.4).

The pepper is not a security boundary on its own; it stops an offline dictionary attack from
turning `sign_in_attempts` into a list of email addresses. Rotating it resets every account's
failure window, which is harmless.

## Tests (§7.8) — `e2e/sign-in-function.spec.ts`

1. Five wrong passwords lock the account; the sixth attempt returns 429 even with the *correct*
   password. Runs against `dev-c`, which exists only for this.
2. An unknown email and a wrong password are indistinguishable in body, status, and timing.
3. A successful sign-in clears the failure count.
4. A locked account and a locked unknown email get the same 429 — status, body, timing — and
   during the lock the correct password gets the same answer as a wrong one (SPEC §7.8 check 5).
   The lockout copy is not a leak: it is shown for any address, real or not.
5. CORS headers only for allowlisted origins.
6. Ten concurrent `begin_sign_in_attempt` calls for one account each see a different number of
   earlier attempts (0–9). Called on the database directly, because the local edge runtime
   answers sign-ins one at a time and cannot stage the race.
7. No attempt is left `pending` once the tests above have finished.

The per-IP block has no e2e test: locally every caller is the same Docker address and a
client cannot fake another (which is the point), so "a second address still gets in" cannot
be staged. Its decisions are unit-tested in `limits.test.ts`; its wiring was checked by hand
with `SIGN_IN_IP_MAX_FAILURES=3` — three failures, then the correct password refused, then
refused again with forged `X-Forwarded-For` / `X-Real-IP` headers. Repeat that after changing
`index.ts`.

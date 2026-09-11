# sign-in

The only pre-auth endpoint. Owns the **per-account** sign-in lockout (SPEC §7.1) — the one
limit that cannot live in `config.toml` (those are per-IP) or in a database trigger (a failed
sign-in has no session to attribute a write to).

## Contract

`POST /functions/v1/sign-in` with `{ email, password }`.

| response | meaning |
|---|---|
| `200 { session }` | pass to `supabase.auth.setSession(session)` |
| `400 { error }` | a field was empty — the only specific message |
| `401 { error }` | generic failure copy, identical for wrong password and unknown email |
| `429 { error, retryAfterMinutes }` | account locked |

## Secrets

```bash
supabase secrets set SIGN_IN_HASH_PEPPER="$(openssl rand -hex 32)"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the
platform. The service role key exists **only** in this function's runtime — never in the
client bundle, never in a `VITE_*` var (§7.4).

The pepper is not a security boundary on its own; it stops an offline dictionary attack from
turning `sign_in_attempts` into a list of email addresses. Rotating it resets every account's
failure window, which is harmless.

## Tests it must have (§7.8)

1. Five wrong passwords lock the account; the sixth attempt returns 429 even with the *correct*
   password.
2. An unknown email and a wrong password are indistinguishable in body, status, and timing.
3. A successful sign-in clears the failure count.

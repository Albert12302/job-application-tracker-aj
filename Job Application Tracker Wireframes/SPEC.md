# Job Application Tracker — Prototype Spec

Reference implementation: `Job Tracker Prototype.dc.html` (single-file React-ish prototype, in-memory state, no backend).
This document describes what the prototype does and the rules a real build must reproduce.

---

## 1. Purpose

A personal tracker for job applications. One user, many applications. The user logs each
application, updates its status as the process moves, keeps notes and an optional cover-letter
file, and sees aggregate stats about how the search is going.

Everything in the prototype is client-side and resets on reload. A real build needs auth,
persistence, and file storage; nothing else about the behavior should change.

---

## 2. Data model

### User
| field | type | notes |
|---|---|---|
| id | uuid | |
| name | string | display name; the prototype derives it from the email |
| email | string | unique, login identifier |
| photo | blob/url | optional avatar; falls back to first initial |

### Application
| field | type | required | notes |
|---|---|---|---|
| id | uuid | yes | |
| user_id | uuid | yes | owner |
| date_applied | timestamptz | yes | a calendar date stored as UTC midnight — see §5.4. Defaults to today when adding |
| company | string | yes | |
| position | string | yes | |
| location | string | no | normalized on save — see §5.2 |
| description | text | no | free text about the role |
| status | enum | yes | see §3 |
| referral | boolean | yes | default false |
| starred | boolean | yes | default false |
| cover_letter_path | text | no | Storage object path `{user_id}/{uuid}.ext`; empty = none |
| cover_letter_name | text | no | original filename, display label only — escape on render (§7.3). Set together with the path or not at all |
| created_at | timestamptz | yes | |
| updated_at | timestamptz | yes | maintained by trigger |
| notes | note[] | — | not a column; see Note below |

### Note
| field | type | notes |
|---|---|---|
| id | uuid | |
| application_id | uuid | |
| body | text | 1–2,000 chars |
| created_at | timestamptz | notes display in creation order |
| updated_at | timestamptz | bumped on edit (§9.3); does not affect order |

### Saved filter (per user)
| field | type | notes |
|---|---|---|
| id | uuid | |
| name | string | defaults to `Custom N` if left blank |
| statuses | enum[] | empty = all statuses |
| referral | `any` \| `yes` \| `no` | |
| starred | `any` \| `yes` \| `no` | |
| location | string \| null | null = `Any location`; otherwise exact match against normalized location |
| text | string | matches company, position, location, description |
| created_at | timestamptz | tab order |

### Status history
Append-only. Not in the prototype, but part of the build from the first status-change feature —
it cannot be backfilled, and without it stats can only ever describe the present.

| field | type | notes |
|---|---|---|
| id | uuid | |
| application_id | uuid | cascade delete with the application |
| from_status | enum \| null | null for the row written at creation |
| to_status | enum | |
| changed_at | timestamp | |

Rules:
- Written by exactly one code path (§9.1) — the detail-screen selector and the edit form both
  call it. Two writers means one will be forgotten.
- A row is written when the application is created, with `from_status = null`.
- No row when a save leaves the status unchanged.
- Never updated or deleted except by the application's cascade. No RLS update or delete policy
  for the user role at all.
- What it buys: time-in-stage, "how many rejections last month", and a real funnel over time
  rather than a snapshot.

---

## 3. Statuses

Six values, fixed set: **Applied, Interview, Callback, Offer, Rejected, Withdrawn.**

Colors (used for tags, chips, and the stats bar — keep them consistent everywhere):

| status | fill | text | contrast | intent |
|---|---|---|---|---|
| Applied | light yellow | dark amber | 7.2:1 | submitted, no response |
| Interview | light blue | dark blue | 6.3:1 | interviewing |
| Callback | light green | dark green | 7.5:1 | employer re-engaged |
| Offer | solid dark green | white | 5.9:1 | offer received |
| Rejected | solid dark red | white | 5.5:1 | closed by employer |
| Withdrawn | light orange | dark orange | 6.3:1 | closed by candidate |

All six pass WCAG AA for normal text; keep these pairings intact if the palette is retinted.

`Applied → Interview → Callback → Offer` is the funnel order used by the progress indicator on
the detail screen. Rejected and Withdrawn are terminal and sit outside the funnel.

---

## 4. Screens

### 4.1 Sign in
Email + password, both required; empty submit shows "Enter an email and password."
Successful sign-in goes straight to the dashboard (no profile picker).
Links to **Create one** (§4.1a) and **Forgot password?** (§4.1c).

### 4.1a Sign up
Email, password, confirm password. Validation, in order:
- invalid email → "Enter a valid email address."
- password under 12 characters → "Password must be at least 12 characters."
- mismatch → "Those passwords don't match."

Helper text under the password field states the 12-character minimum and encourages a
passphrase. Submit creates the account in an unverified state and goes to §4.1b.
Success and "email already registered" are indistinguishable from the client (§7.1).

### 4.1b Verify email
Confirmation screen naming the address the link was sent to, stating the 60-minute
single-use expiry, with **Resend email** (rate-limited, §7.1) and a link back to sign-in.
The account holds no data until verified. The prototype has a "Simulate opening the link"
button standing in for the emailed link.

### 4.1c Forgot password
Email field, one button. Always advances to the same confirmation screen: "If that email
has an account, we've sent a link to reset the password." Never confirms or denies that the
address exists.

### 4.1d Reset password
Reached from the emailed link. New password + confirm, same rules as sign-up. States that
saving signs out all other devices. On success, returns to sign-in with a confirmation
banner rather than auto-signing-in.

**Access:** two accounts at launch. Self-serve sign-up exists but should be gated (invite
list or an allowlist check) until the product is meant to be open — the screens are built,
the door does not have to be unlocked.

### 4.2 Dashboard (application list)
Persistent header: app name, nav (Home, Stats), avatar + name (opens Profile).

Controls, top to bottom:
- **Search** — substring match over company, position, location. Resets to page 1.
- **Filter tabs** — `All (n)`, then one per status with live counts, then any saved filters
  (each with an × to delete), then `+ Filter` which opens the filter builder.
- **Filter builder** (§5.1) — collapsible panel.
- **Sort** — date column header toggles newest ↔ oldest, chevron indicates direction.

Table columns: star · date · company · position · location · status tag · 📎 (cover letter
present) · referral Y/N · chevron. Clicking a row opens the detail screen; clicking the star
toggles it without opening the row.

Pagination below the table: rows per page (10 / 25 / 50), `x–y of n` range label, Previous /
Next, numbered pages. Changing page size or any filter resets to page 1.

A floating **Jump to bottom** pill appears when more than ~100px of scroll remains.

Empty state when a filter or search matches nothing.

### 4.3 Add application
Fields: date (defaults today), company*, position*, location (combobox — suggests existing
locations, accepts new), description, status (defaults Applied), referral toggle, cover-letter
attach, first note.

Validation: company and position required → "Company and position are required."
Save prepends the new application to the list and returns to the dashboard with filter reset
to All.

### 4.4 Application detail
Header: company, position, location, date, status tag, star.
Funnel indicator showing position across Applied → Interview → Callback → Offer.
Status selector — changing it updates the record immediately, which recalculates the tab
counts and the stats screen live.
Description, cover-letter file, referral flag, notes list with an add-note field.
Actions: edit fields, delete application (confirm first).

### 4.5 Stats
Computed live from the current application set:
- total applications
- **Interviewed** — status in {Interview, Callback, Offer}
- **Callbacks** — status in {Callback, Offer}
- **Offers** — status = Offer
- **Heard back** — status not in {Applied, Withdrawn} — the response rate
Each shown as a count plus a percentage of total, with a stacked breakdown bar segmented by
status (segments proportional to count, colored per §3, zero-count statuses omitted).

### 4.6 Profile
Avatar (click to upload a photo; "Remove photo" reverts to the initial), name, application
count, sign out.

---

## 5. Business rules

### 5.1 Filter matching
An application matches a saved filter when **all** of these pass:
1. `statuses` empty, or the application's status is in the list
2. `referral` is `any`, or matches the boolean
3. `starred` is `any`, or matches the boolean
4. `location` is `Any location`, or exactly equals the application's location
5. `text` is empty, or is a case-insensitive substring of
   `company + position + location + description`

The dashboard search box applies **on top of** the active filter and matches only
company + position + location.

### 5.2 Location normalization
On save, a typed location is:
1. trimmed, internal whitespace collapsed
2. matched case-insensitively against locations already used by this user — on a hit, the
   existing spelling wins (so "san francisco, ca" becomes "San Francisco, CA")
3. otherwise title-cased per comma-separated part, with 2-letter parts uppercased
   ("austin, tx" → "Austin, TX")

This keeps the location filter's option list clean without a fixed location table.

### 5.4 Dates and timezones
`date_applied` is a **calendar date, stored as a UTC timestamp at 00:00:00Z** and a database
constraint enforces that. It is not a moment in time — "I applied on the 3rd" is true regardless
of where the user was standing.

Two rules make that storage safe, and they are not optional:

1. **Write UTC midnight.** The date picker yields `YYYY-MM-DD`; the app appends `T00:00:00Z`.
   Never `new Date(input).toISOString()` on a local-time value — in UTC-7 that writes 07:00Z,
   and the constraint rejects it.
2. **Format in UTC.** Every display, every group-by, every "last 30 days" boundary uses UTC.
   Formatting UTC midnight in the browser's zone shows the previous day for everyone west of
   Greenwich — the single most common version of this bug.

`created_at`, `updated_at`, `changed_at`, and note timestamps are genuine moments and stay
plain `timestamptz` in real UTC, formatted in the viewer's local zone. Only `date_applied`
gets the UTC-midnight treatment, because only it is a date the user chose rather than a time
something happened.

If the app ever gains reminders or "applied 30 days ago" nudges, revisit — those are moments,
and they need the user's zone stored on the profile.

### 5.3 Counts and sorting
Tab counts and stats always reflect the full application set for the user, never the current
page or search. Default sort is date descending.

---

## 6. Suggested build order

1. **Auth + user record** — sign in, session, profile screen with photo upload.
2. **Applications CRUD** — add, list, detail, edit, delete. Hardcode stats to zero.
3. **Persistence** — real database, then file storage for cover letters.
4. **Status history** — write on every status change (§2), then rebuild stats from it.
5. **Filtering** — search, status tabs, then the saved-filter builder.
6. **Pagination and sort** — once row counts justify it.

7. **Data export** (§9.8), then **account deletion** (§9.7) — in that order, export first.

Ship 1–3 before touching 4–6; the prototype's filter and stats work is only worth rebuilding
against real data.

The schema for all of this is already written (`supabase/migrations/`), so each step is
feature code against tables that exist rather than a migration per step. Rate limits (§7.1)
are likewise already in place — the sign-in edge function is part of step 1, not a later pass.

---

## 7. Security requirements

Non-negotiable. Every item is a release blocker, not a nice-to-have. Treat this section as the
checklist for the pre-launch audit.

### 7.1 Authentication
Supabase Auth owns sign-in, sessions, and password hashing. Do not hand-roll any of it and do
not store a password column of your own — if a password ever touches your own tables,
something is wrong.

Sign-up, password reset, and email verification are specified and prototyped (§4.1a–d).
These requirements apply to them:

- Email confirmation required before the account can hold data.
- **No account enumeration on any surface.** Sign-in, sign-up, and password reset all return
  the same generic response whether or not the email exists: "If that email has an account,
  we've sent a link." Response timing must not differ either.
- Password reset tokens: single-use, 60-minute expiry, invalidated on use or on a new request.
- Changing a password or email signs out all other sessions.
- Password policy: minimum 12 characters, maximum 128, no composition rules, no forced
  rotation. Check new passwords against a breached-password list if the provider offers it.

**Sessions**

| setting | value |
|---|---|
| Access token (JWT) lifetime | 1 hour |
| Refresh token | 30 days, sliding |
| Absolute session cap | 90 days, then full re-auth |
| Idle timeout | 14 days without activity |
| On sign-out | refresh token revoked server-side, not just the cookie cleared |

**Rate limits** — set these explicitly; do not accept provider defaults.

Each limit has exactly one home, chosen by what can actually observe the event. Anything
without a home is not a limit, it is a wish:

| limit | lives in | why there |
|---|---|---|
| Sign-in **per account** | `supabase/functions/sign-in` | must be recorded on a *failed* sign-in, which has no session and no trustworthy client |
| Sign-in / sign-up per IP, token refresh, verifications | `supabase/config.toml` `[auth.rate_limit]` | provider-side, per-IP by nature |
| Password reset + verification sends | `config.toml` `email_sent` + `max_frequency` | Auth owns the send |
| File uploads per user | trigger on `storage.objects` | a limit the client is asked to observe is not a limit |
| Write mutations per user | triggers on the four writable tables | the database sees every write, including ones the UI did not make |
| Error reports per user | trigger on `app_errors` (§7.7) | same |

Counters live in `public.rate_limits`, a fixed-window table with RLS on and **no policies at
all** — only `consume_rate_limit()` and the service role reach it. Fixed windows allow up to
2x the limit across a boundary; that is accepted, because these limits exist to stop runaway
loops and abuse rather than to meter anything.

Failure counts key on a **SHA-256 of a peppered, lowercased email**, never the address (§7.7).


| action | limit | on exceed |
|---|---|---|
| Sign-in, per account | 5 failures / 15 min | exponential backoff, then 15-min lockout |
| Sign-in, per IP | 20 failures / hour | temporary block |
| Sign-up, per IP | 5 / hour | reject |
| Password reset, per email | 3 / hour | silently succeed, send nothing |
| Password reset, per IP | 10 / hour | reject |
| File upload, per user | 20 / hour | reject with a clear message |
| Write mutations, per user | 120 / min | reject |

Lockouts are per account **and** per IP — per-IP alone is trivially bypassed, per-account
alone allows targeted denial of service.
- Sessions expire; log out invalidates server-side, not just the cookie.
- Rate-limit sign-in, sign-up, and password-reset endpoints — per IP and per account.

### 7.2 Authorization — Row Level Security
**This is the single most important item in this document.** With Supabase the client holds a
real database key; RLS is the only thing standing between a user and everyone else's data.

- Row Level Security **enabled on every table**, no exceptions. A table without RLS is fully
  readable by anyone holding the anon key, which is shipped in the browser bundle.
- Policy on every table: `auth.uid() = user_id`, applied to select, insert, update, and delete
  separately. An insert policy that omits the check lets a user write rows owned by someone else.
- Verify by testing as a second user, not by reading the policy. Add an automated test that
  signs in as user B and asserts zero rows returned for user A's data.
- The `service_role` key bypasses RLS entirely. It never appears in client code, in the React
  bundle, in `NEXT_PUBLIC_*`-style vars, or in git. Server-side only, or not at all.
- Storage buckets have their own policies. Cover letters go in a **private** bucket, served via
  short-lived signed URLs — never a public bucket.
- Enforce ownership at the data layer, not in the UI. Never trust an id from the client.
- Admin routes (if any exist) sit behind a separate role check, not obscurity.
- Secure every API endpoint by default: deny unless explicitly authorized.
- Every read and write is scoped by `user_id` — applications, notes, saved filters, uploads.

### 7.3 Input and output
- Sanitize and validate all input server-side against the same Zod schema the form uses.
  Client validation is UX, not security.
- Protect against XSS: escape all user-supplied output, never `dangerouslySetInnerHTML` /
  `innerHTML` on user content. Applications hold free text (description, notes) — that is the
  main injection surface.
- Parameterized queries only; no string-concatenated SQL.

**Field limits** — enforced in the Zod schema *and* as Postgres constraints. Without a cap, a
single note can be a megabyte.

| field | limit |
|---|---|
| company, position, location | 120 characters each |
| description | 5,000 characters |
| note body | 2,000 characters |
| saved filter name | 60 characters |
| email | 254 characters |
| password | 12–128 characters |
| notes per application | 200 |
| applications per user | 5,000 (soft cap; alert rather than reject) |

**File uploads**

| rule | value |
|---|---|
| Cover letter types | PDF, DOC, DOCX only |
| Cover letter max size | 10 MB |
| Avatar types | PNG, JPEG, WebP |
| Avatar max size | 2 MB, max 4000×4000 px |
| Type check | verify magic bytes server-side — never trust the extension or the client's `Content-Type` |
| Stored filename | generate a UUID; keep the original name only as a display label, escaped |
| Storage path | prefixed with the owner's user id, e.g. `{user_id}/{uuid}.pdf` |
| Serving | private bucket, signed URL with a **60-second** TTL, generated on click — never embedded in page HTML |
| Download response | `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` |

SVG is not an accepted type anywhere. It is a script execution vector.

### 7.4 Secrets and configuration
- Only the Supabase URL and **anon** key belong in client env vars. Everything else —
  `service_role`, any third-party API key — is server-side only.
- Audit `.env` handling: `.env` gitignored, `.env.example` committed with blank values.
- Scan git history for committed secrets; rotate anything ever exposed — deleting the file
  does not remove it from history.
- Debug mode off in production; no stack traces, Supabase error details, or verbose errors
  returned to the client.
- Check for exposed files: no `.git`, `.env`, backups, or source maps reachable over HTTP.

### 7.5 Transport and headers
- HTTPS only, HSTS on (`max-age=31536000; includeSubDomains`). Cookies `Secure`, `HttpOnly`,
  `SameSite=Lax` or stricter.
- Content-Security-Policy, no `unsafe-inline` in `script-src`. A working starting point:

  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';          # Tailwind-injected styles
  img-src 'self' data: blob: https://<project>.supabase.co;
  font-src 'self';
  connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  ```

  The Supabase origin must be in `connect-src` (and `wss:` if Realtime is used) or every
  request fails. Ship it in report-only mode first, then enforce — do not disable it when it
  breaks something.
- Also set: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` denying camera/microphone/geolocation.
- CORS restricted to known origins. No `*` on any authenticated endpoint, and no reflecting
  the request's `Origin` header back.

### 7.6 Database and dependencies
- Postgres access through Supabase with RLS on (§7.2). No direct connection string in client
  code. Any server-side connection uses a least-privilege role, not the superuser.
- **Postgres functions and triggers:** avoid `SECURITY DEFINER`. Where it is unavoidable, pin
  `set search_path = ''` and schema-qualify every reference — an unpinned `search_path` on a
  definer function is a privilege-escalation path.
- Install extensions into a dedicated `extensions` schema, not `public`.
- Views that touch user data are `security_invoker = on`, or they silently bypass RLS.
- If Realtime is enabled, confirm its policies separately — a subscription is a read, and it
  needs the same RLS scrutiny as a query.
- Remove unused packages; keep the dependency tree small.
- Keep dependencies patched; run an automated vulnerability scan in CI and on a schedule.
- Enable point-in-time recovery / scheduled backups before real user data exists, and test a
  restore at least once.

### 7.7 Logging and monitoring
The rule "never log PII" leaves a gap unless what *should* be logged is written down.

**Three destinations, by kind of event:**

| kind | where | why |
|---|---|---|
| Auth events (sign-in, sign-up, reset, verification) | Supabase Auth logs — already captured, just set retention and actually read them | no code to write, and it sees attempts your app never does |
| App errors and crashes | an `app_errors` Postgres table, insert-only | two users; the database, RLS, and a place to read it already exist. No third party sees application data |
| Security events the app decides (RLS denial, rate-limit trip, upload/delete, permission failure) | a `security_events` Postgres table, insert-only | queryable next to the data it describes |

**`app_errors` columns:** id (uuid, shown to the user — §8), message, stack, user_id (nullable),
route, release/commit sha, user agent, created_at. RLS: users insert only; nobody reads via
the client — read it in the dashboard or with a service-role script.

**One reporting function, always.** Everything routes through `services/report-error.ts`
exporting `reportError(error, context)`. Nothing else in the app knows where errors go. This
is the whole cost of keeping the option open: today its body inserts a row, later it calls a
hosted SDK, and no call site changes. Never call the transport directly from a component.

What this trades away, accepted deliberately: no alerting, no grouping of duplicate errors,
no source-mapped stack traces. Those matter at volume; with two users who can describe what
broke, they do not. Revisit when the app has real users — **GlitchTip** (open source,
Sentry-API-compatible) or Sentry itself are the natural upgrades, and either is a change to
one function body plus source-map upload in the build.

If a hosted tool is adopted later, it gets configured for this app or it undoes the rest of
§7: PII off, **no session replay on any form screen**, and a scrubber dropping request bodies,
emails, and application or note fields. An error report says *what broke*, never *what the
user typed*.

**Because `app_errors` and `security_events` are written by the client, treat them as
untrusted, capped, and write-only:**

- **`user_id` is never sent by the client.** Default it to `auth.uid()` in the column
  definition. A client-supplied id is a forgery waiting to happen.
- **Insert-only policy, and no select policy at all** for the user role. Read these tables in
  the dashboard or with a service-role script. A user reading the error table reads other
  people's stack traces.
- **Cap and count.** `message` 1,000 chars, `stack` 8,000, hard-truncate rather than reject.
  Rate-limit inserts per user (60/hour is plenty) and de-duplicate identical errors within a
  session client-side \u2014 an error inside a render loop will otherwise write thousands of rows
  and become a denial-of-wallet event against your own database.
- **Never store a raw database error message.** Postgres constraint violations echo the
  offending value \u2014 a length-cap violation on a note will happily put the note text in the
  error string. Map database errors to a code before reporting.
- **Strip query strings from the logged route.** `/applications?q=acme&filter=...` contains
  the user's search terms, which are user content. Log the path only.
- **`context` is a fixed shape, not an open object.** Accept a small typed set (route, action,\n  error code) rather than `Record<string, unknown>` \u2014 an open bag is how form values end up
  in the log six months from now.
- **These tables are in your backups.** Whatever lands there inherits the retention of the
  whole database, so the rules above matter more than they would for a 90-day log service.
  Purge `app_errors` on the same 90-day schedule (\u00a77.7) with a scheduled job.
- **If an in-app viewer is ever built:** render stack text as text, never with
  `dangerouslySetInnerHTML`. Stored error strings are attacker-influenced.

- **Log these security events:** sign-in success and failure, sign-out, password change,
  password reset request and completion, email change, rate-limit trip, permission denial
  (RLS rejection), file upload and delete, account deletion.
- **Each entry contains:** event type, user id (opaque UUID), timestamp, source IP, outcome.
- **Never log:** email addresses, passwords or tokens, application or note content, company or
  position names, uploaded file names, full request bodies. This applies to `app_errors` too —
  a stack trace is fine, the form values that caused it are not.
- Errors are logged with an id; the id is shown to the user, the detail is not (§8).
- Retain security logs 90 days. Alert on: repeated rate-limit trips for one account, an
  unusual spike in RLS denials (a sign someone is probing ids), or upload volume anomalies.

### 7.8 Pre-launch audit
Before any real user data exists, run a full pass over §7.1–7.7 and record the result. Repeat
before each release that touches auth, uploads, or the data layer.

The four checks worth doing by hand, because tooling misses them:
1. Sign in as user B, attempt to read and to modify user A's application by id. Expect zero
   rows and a rejected write.
2. Grep the built client bundle for `service_role` and for any key that is not the anon key.
3. Request a cover-letter signed URL, wait for it to expire, confirm it stops working — then
   confirm the bucket is not publicly listable.
4. Delete an application, then confirm its notes, history rows, and Storage object are all
   gone.
5. Five wrong passwords on one account, then a sixth attempt with the *correct* password —
   expect the lockout, and expect the same response body and timing as a wrong password.

### 7.9 Definition of done

A feature is done when all of the following are true. This is the checklist, not a summary of
one — if an item does not apply, say so in the pull request rather than skipping it silently.

**Behavior**
1. It does what the relevant SPEC section says, including the specific error copy (§8).
2. Loading, empty, and error states all exist and were seen by a human (§8.2). The error path
   was triggered on purpose, not assumed.
3. Mutations are optimistic where §8.3 says so, and roll back on failure.
4. Nothing new fetches in a `useEffect`; server state goes through a `queries/` hook, and its
   invalidations are declared.

**Correctness**
5. Business rules live in `domain/` as pure functions with unit tests covering the edge cases
   the spec names — not just the happy path.
6. Any new shape has one Zod schema, used by the form, the route params, and any parsing.
7. `typecheck`, `lint`, `test` pass. No `any`, no `@ts-expect-error` without a comment saying
   what it is waiting on.

**Security** — the items that apply, from §7
8. New table: RLS enabled and a separate policy per operation, in the same migration.
9. New client-written column: no client-supplied `user_id`, a length cap in both the Zod schema
   and a Postgres constraint.
10. New file path: private bucket, owner-prefixed path, magic-byte check, signed URL on click.
11. Nothing new is logged that §7.7 forbids. Errors go through `reportError()`.
12. Cross-user check where the feature touches data: a test signing in as user B.

**Accessibility** — §10
13. Keyboard-only pass, including every new control. Visible focus everywhere.
14. Labelled inputs, errors associated with their fields, async changes announced.
15. axe clean on the changed surfaces.
16. Contrast measured on any new color pairing, not eyeballed (§10.1).

**Mobile and browsers**
17. Checked at 360px and at 200% zoom; touch targets 44px below the 760px breakpoint (§11).
18. Checked in iOS Safari, not just a narrow desktop window (§12). Date inputs, file pickers,
    and viewport height are where it differs.

**Documentation**
19. SPEC.md updated in the same commit if behavior changed, with a §14 changelog line saying
    what and why. CLAUDE.md updated if a convention changed.

Two rules about the list itself: it is checked at the end of a **feature**, not each commit;
and an item that keeps getting waived is either wrong or points at something worth fixing
properly — change the list rather than quietly ignoring it.

---

## 8. Loading, empty, and error states

The prototype shows only the happy path. Every list and every mutation must define all three.
Nothing ships with an unhandled failure.

### 8.1 Rules
- **Never a bare spinner on a full page.** Use skeleton rows that match the real layout so the
  page does not jump when data lands.
- **Never fail silently.** Every mutation either visibly succeeds or shows a recoverable error.
- **Every error offers a next step** — retry, or a way back. No dead ends.
- **Never show a raw error object or Supabase message.** Log the detail (without PII), show
  plain language.
- Distinguish *empty because there is no data yet* from *empty because a filter excluded
  everything*. They need different copy and different actions.

### 8.2 Per surface

| Surface | Loading | Empty | Error |
|---|---|---|---|
| Application list | 5 skeleton rows in the table shell; controls visible but disabled | **No applications yet** — headline, one line of copy, "Add application" button | "Couldn't load your applications." + Retry. Keep header and nav usable |
| List, filtered | skeleton rows | **No matches** — name the active filter/search, offer "Clear filters" | as above |
| Detail | skeleton of header, funnel, notes | n/a | "Couldn't load this application." + Retry + Back to list. If the id does not exist or is not the user's: "Application not found" + Back (never reveal that it exists but belongs to someone else) |
| Stats | skeleton bars at fixed height | **Nothing to chart yet** — "Add your first application to see stats." | "Couldn't load stats." + Retry, inline, list nav still works |
| Add / edit form | disable submit, spinner in the button, keep fields editable | n/a | Inline error above the form, field-level errors on the fields, **entered values preserved** — never clear the form on failure |
| Cover letter upload | progress indicator on the row | n/a | "Upload failed." + Retry. Application saves without the file rather than losing the whole record |
| Note add | optimistic append, muted until confirmed | "No notes yet." | Roll back the optimistic note, restore the text to the input, show "Couldn't save note." + Retry |
| Saved filters | n/a | "No saved filters yet" next to `+ Filter` | Fall back to the built-in status tabs; do not block the list |
| Sign in | spinner in the button, form disabled | n/a | Inline, above the form. Generic copy for bad credentials — never reveal whether the email exists |
| Session expired | n/a | n/a | Redirect to sign-in with "Your session expired. Sign in to continue." Return to the previous screen after sign-in |
| Offline | n/a | n/a | Persistent banner: "You're offline. Changes won't save." Disable mutations |

### 8.3 Optimistic updates
Status change, star toggle, and note add update the UI immediately, then reconcile. On
failure: revert to the previous value, show a toast naming what failed, and leave the record
untouched. Never leave the UI showing a state the database does not have.

---

## 9. Edit and delete

### 9.1 Edit an application
Reached from the detail screen. Same fields and validation as Add (§4.3), pre-filled.
- Location re-normalizes on save (§5.2).
- Changing status here writes a `status_history` row exactly as the detail-screen status
  selector does — one code path, not two.
- Cancel with unsaved changes prompts to confirm before discarding.
- Save returns to the detail screen with the updated record.

### 9.2 Delete an application
- Confirmation dialog naming the record: "Delete your application to *Acme Corp*? This also
  deletes 3 notes and 1 attached file. This can't be undone."
- Hard delete of the application, its notes, and its `status_history` rows (`on delete
  cascade`).
- The cover-letter file is removed from Storage in the same operation. A deleted record must
  not leave an orphaned file — if the Storage delete fails, log it for cleanup rather than
  failing the whole delete.
- Returns to the list with a toast: "Application deleted." Offer Undo for ~5 seconds by
  deferring the commit; if Undo is not implemented, do not show it.

### 9.3 Notes
- Notes are individually editable and deletable from the detail screen.
- Edit is inline; save on blur or explicit Save, Escape cancels.
- Delete asks for confirmation only if the note is longer than a line; otherwise delete with
  an undo toast.
- Editing a note updates `updated_at`; display order stays by `created_at`.

### 9.4 Cover letter
- Replace: upload a new file, the old one is deleted from Storage after the new one commits.
- Remove: confirmation, then delete from Storage and clear the field.

### 9.5 Saved filters
- Deleting a saved filter (the × on its tab) is immediate, no confirmation — it destroys no
  application data. If it is the active filter, fall back to **All**.
- Renaming and editing a saved filter is out of scope for v1; delete and recreate.

### 9.6 Account
Sign out clears the session and any cached data.

### 9.7 Account deletion
In scope, built after §6 step 6. Deletion is the one operation with no recovery path, so the
rules are specific:

- Reached from Profile, behind a confirmation dialog that requires typing the account's email
  address — not a "yes I'm sure" button. Nothing else in the app asks for typed confirmation;
  this earns it.
- The dialog offers **Export my data first** (§9.8) and states exactly what goes:
  "Deletes N applications, N notes, N files, and this account. This can't be undone."
- **Immediate hard delete**, no grace period and no soft-delete flag. A 30-day window means
  the data is still there — which is the opposite of what the user asked for, and it means
  every query in the app has to remember to exclude it.
- Order matters, because Storage does not cascade: **delete Storage objects first**, then the
  `auth.users` row and let the database cascade take applications, notes, history, saved
  filters, and the profile. A failed Storage delete aborts before the account is gone, so a
  retry is possible; the reverse order leaves orphaned files with no owner to find them by.
- One code path, `services/delete-account.ts`, mirroring §9.2.
- Writes a `security_events` row (`account_deletion`) — the one record that survives, holding
  a user id and a timestamp and nothing else. `app_errors.user_id` and
  `security_events.user_id` are `on delete set null`, so older rows keep their stack traces
  and lose the person.
- Signs out all sessions and returns to sign-in with "Your account and data have been deleted."

### 9.8 Data export
In scope, and built **before** deletion — deleting without an exit is a hostage situation.

- Profile → **Export my data**. One button, no options, no format picker.
- Produces a single `.zip`, assembled client-side from data the user can already read:
  `applications.json` (each application with its notes and full status history nested),
  `saved-filters.json`, `profile.json`, and a `files/` directory of cover letters and the
  avatar, fetched through the same 60-second signed URLs the detail screen uses.
- JSON, not CSV: notes and history are nested, and flattening them loses the part worth
  keeping. If a spreadsheet is ever asked for, it is a second button, not a replacement.
- No server-side job, no email-me-a-link, no export table. At 5,000 applications this is a few
  megabytes of text — a queue would be infrastructure earning nothing.
- Progress in the button, and it handles the three states like everything else (§8). A failed
  file fetch does not fail the export: the zip includes `export-errors.txt` naming what was
  skipped.

---

## 10. Accessibility

Target: **WCAG 2.2 Level AA** (https://www.w3.org/WAI/standards-guidelines/wcag/). AA on every
screen is a release requirement, checked the same way as §7.

### 10.1 Perceivable
- Text contrast ≥ 4.5:1; large text and UI component boundaries ≥ 3:1.
- The palette has been audited (see §3 for measured status ratios). Anything added later gets
  measured, not eyeballed. Two rules the audit produced, worth keeping:
  - the accent color is used both as a **fill under white text** and as a **focus/selection
    outline**, so it must clear 4.5:1 against white — a light tint cannot do both jobs;
  - form-control borders and icon-only state indicators (the star) carry meaning and need
    3:1, which is darker than a decorative card border.
- Status is never communicated by color alone: every tag carries its text label, and the stats
  breakdown bar has a text legend with counts.
- All images and icon-only controls have text alternatives. The star, paperclip, chevrons, and
  avatar all need accessible names.
- Layout reflows to 320px width without horizontal scrolling, and survives 200% zoom and
  400% text resizing.

### 10.2 Operable
- Everything reachable and operable by keyboard alone, in a logical order, with no traps.
  The table rows, star toggles, filter chips, and pagination are all currently click-only in
  the prototype — they must be real buttons or have proper key handling.
- Visible focus indicator on every interactive element, meeting the 2.2 focus-appearance rule
  (not the browser default suppressed by a CSS reset).
- Touch/click targets at least 24×24 CSS px (2.2 requirement); aim for 44×44 on touch.
- "Skip to content" link before the header nav.
- Dialogs trap focus while open, close on Escape, and return focus to the trigger.
- No time limits on any interaction.

### 10.3 Understandable
- Every input has a persistent visible label — placeholder text is not a label.
- Errors identified in text, associated with their field programmatically, and describing how
  to fix the problem (§8).
- Nothing changes context on focus or on input alone; filters apply predictably.
- 2.2 additions to honor: do not require re-entering information already given in the same
  process, and keep help/actions in a consistent place across screens.

### 10.4 Robust
- Semantic HTML first: real `<table>` for the list, `<button>` for actions, `<nav>`, `<main>`,
  headings in order. ARIA only where semantics fall short.
- Announce async changes with a live region: results count after filtering, save confirmations,
  errors.
- Sort state exposed via `aria-sort`; pagination as a labelled `<nav>` with the current page
  marked `aria-current="page"`.
- Respect `prefers-reduced-motion` — no non-essential animation for users who opt out.

### 10.5 Verification
Automated checks (axe or equivalent) in CI, plus a manual keyboard-only pass and one
screen-reader pass per release. Automated tools catch roughly a third of issues; do not treat
a clean axe run as compliance.

---

## 11. Mobile

The app is used on a phone as often as a laptop — a listing is usually found on a phone.
Breakpoint: **760px**. Below it, the following changes apply.

- **The table becomes cards.** A horizontally scrolling nine-column table is unusable on a
  phone. Each application renders as a card: company and position stacked, star at the top
  right, then a metadata row of status tag, date, location, cover-letter and referral marks.
  Nothing is dropped, it is re-ordered by importance.
- **Sort moves out of the table header** into its own control above the list, labelled
  "Newest first" / "Oldest first" rather than an unlabelled chevron.
- **Numbered pages are hidden**; Previous / Next and the range label remain. Ten numbered
  targets do not fit at a usable size.
- **Controls go full-width and stack** — search above the add button, both edge to edge.
- **Control height goes 36px → 44px** for every input, select, and button; the star tap area
  is a 44×44 box around a 19px icon.
- Stats cards go from four columns to two. Detail, add, and stats panels drop their fixed
  max-width and their padding tightens.
- Page padding tightens to 14px, and bottom padding grows so the floating jump pill never
  covers the last row.

Unchanged on mobile: filter tabs (they already wrap), the filter builder, and every business
rule. This is a layout response, not a reduced feature set — no "view on desktop for more".

---

## 12. Browser support

Supported, and tested before release:

| browser | version |
|---|---|
| Chrome (desktop + Android) | last 2 versions |
| Edge | last 2 versions |
| Firefox | last 2 versions |
| Brave | last 2 versions |
| Safari (macOS) | 17+ |
| **Safari (iOS) / any iOS browser** | 17+ |

Notes on that list:

- **Brave, Edge, Arc, Opera and Vivaldi are all Chromium** — they share Chrome's engine, so
  Chrome coverage covers them. What Brave changes is *privacy*, not rendering: aggressive
  third-party cookie and storage partitioning. Worth a manual pass on sign-in and session
  persistence, because that is where its shields actually bite.
- **iOS Safari is not optional.** Every browser on iOS uses WebKit, so "we support Chrome on
  iPhone" means Safari whether you like it or not. It is also where `<input type="date">`,
  file pickers, and the 100vh viewport behave differently — and mobile is now specified
  (§11), so it is a first-class target, not an afterthought.
- **Firefox** has its own engine and is the one place a Chromium-only bug will show up.
  Keep it in the manual pass.
- **No Internet Explorer, no pre-Chromium Edge.** Not a personal-tool audience.

Progressive enhancement is not required — this is an authenticated app, JavaScript is a
given. But it must not *silently* break: an unsupported browser gets a plain message, not a
blank screen.

---

## 13. Out of scope for the prototype

Multi-user sharing, email/calendar integration, reminders, resume versioning, interview
scheduling, import from job boards. None of these are designed yet.

---

## 14. Changelog

Newest first. One line per substantive decision — what changed and *why*, so a choice that
looks arbitrary later can be traced to its reason. Layout and copy tweaks do not belong here;
the prototype is the reference for those.

### 2026-09-10
- **Definition of done written (§7.9).** Nineteen items across behavior, correctness,
  security, accessibility, mobile, and documentation — checked per feature, not per commit.
  It closes the last structural gap in the spec: every other §7 and §10 requirement existed
  with no moment at which anyone was obliged to check it.
- **Every rate limit in §7.1 now has exactly one home**, chosen by what can observe the event:
  per-IP and email-send limits in `supabase/config.toml` (version-controlled, not the
  dashboard), per-user write and upload limits as Postgres triggers, and the per-account
  sign-in lockout in a `sign-in` edge function. The lockout cannot live anywhere else — it
  must be recorded on a *failed* sign-in, which produces no session and therefore no
  trustworthy client to record it.
- **Upload and write limits are enforced by triggers, including on `storage.objects`.** A limit
  the client is asked to observe is not a limit.
- **Sign-in failure counts key on a peppered SHA-256 of the email**, so the lockout table is
  not a list of email addresses (§7.7).
- **`enable_signup = false` in config**, matching the gating decision — the door is now
  actually locked rather than described as locked.
- **Initial migrations written (`supabase/migrations/`).** §7 existed only as prose; every
  RLS policy, field cap, private bucket, and the insert-only log tables are now SQL. The
  `user_id` default of `auth.uid()` and the no-select policies are migration-level — if the
  first migration gets them wrong every later table inherits the flaw, so they went in before
  any feature code.
- **Ownership for `notes` and `status_history` is an EXISTS check against the parent
  application**, not a denormalized `user_id`. A copied id can drift out of sync with its
  parent's owner; an EXISTS check cannot.
- **`status_history` has no update and no delete policy at all**, and a constraint rejecting a
  row where `from_status = to_status` (§2 says none is written). Append-only is enforced by
  the absence of a policy, not by convention.
- **No database trigger writes `status_history`.** A trigger plus `services/change-status.ts`
  would be the two writers §2 warns about; the service is the single writer.
- **`date_applied` is a UTC-midnight `timestamptz`** with a constraint enforcing it (§5.4).
  Resolves the open timezone question. It is a calendar date, not a moment, so it must be
  written as `T00:00:00Z` and **formatted in UTC** — formatting it locally shows the previous
  day for every user west of Greenwich.
- **Account deletion and data export moved into scope (§9.7, §9.8).** Export ships first;
  deletion is an immediate hard delete with typed-email confirmation, Storage emptied before
  the cascade, and `log.user_id on delete set null` so error rows outlive the person without
  identifying them.
- **Two log-table decisions the SQL forced:** `app_errors` hard-truncates on insert rather
  than rejecting, because a failed error report masks the error it was reporting; and
  `security_events` stores no IP, because a client-reported IP is worthless and the real one
  is already in the Auth and edge logs.
- **Local seed creates two users** (`dev-a`, `dev-b`), so the §7.8 cross-user isolation checks
  have a second account to run as from the first day rather than a manual setup step.

### 2026-09-09
- **`status_history` promoted from recommendation to the data model (§2).** Append-only, one
  writer, a row at creation with `from_status = null`. It cannot be backfilled, so deferring
  it costs the entire history.
- **Logging destinations chosen (§7.7):** Supabase Auth logs for auth events, insert-only
  `app_errors` and `security_events` Postgres tables for everything else. No external error
  service for now — at two users it buys alerting and grouping we don't need, and adds a
  third party to the data path. All reporting goes through one `reportError()` function so
  adopting GlitchTip or Sentry later is a change to one function body.
- **Client-written log tables hardened (§7.7).** `user_id` defaults to `auth.uid()` rather
  than arriving from the client; insert-only with no select policy; capped and rate-limited;
  raw Postgres error strings mapped to codes first, because a constraint violation echoes the
  value that caused it — which is how note text ends up in an error log.
- **Browser support stated (§12):** Chrome, Edge, Firefox, Brave last 2 versions; Safari and
  iOS Safari 17+. iOS Safari is mandatory because every iOS browser is WebKit.
- **Mobile spec added (§11).** Breakpoint 760px; the table becomes cards rather than
  scrolling sideways. No feature is removed on small screens.
- **Auth screens specified and prototyped (§4.1a–d):** sign-up, verify email, forgot
  password, reset password. Previously only sign-in existed, which left §7's rate-limiting
  and enumeration rules with nothing to attach to.
- **Self-serve sign-up gated.** Two accounts at launch; the screens exist, the door stays
  locked until the product is meant to be open.
- **Concrete security numbers set (§7).** Session 1h/30d/90d, sign-in 5 failures per 15 min,
  uploads 10MB PDF/DOC/DOCX, signed URLs 60 seconds, field caps 120/5000/2000 chars.
  Previously these were "short-lived" and "reasonable", which is unbuildable.
- **Password minimum set to 12 characters**, no composition rules, no forced rotation —
  length beats complexity, and rotation drives password reuse.
- **Signed URLs generated on click, not at page render.** A URL sitting in page HTML is
  replayable by anyone with the source, however short its life.
- **Logging section added (§7.7).** "Never log PII" left undefined what *should* be logged;
  security events are now enumerated.
- **Palette contrast audited (§3, §10.1).** All six status colors passed (5.5–7.5:1). Five
  other pairs failed and were corrected in the prototype — most seriously white text on the
  primary button at 2.5:1. The accent had to darken; a tint light enough to look soft cannot
  carry white text.
- **WCAG 2.2 AA adopted as a release requirement (§10)**, not a polish pass.
- **Loading / empty / error states specified per surface (§8).** The prototype shows only the
  happy path.
- **Edit and delete detail specified (§9)**, including Storage cleanup on delete — an
  orphaned file is a privacy leak, not just clutter.
- **`status_history` recommended (§2).** Stats currently derive from current status only,
  which cannot answer "how long in interview". It cannot be backfilled, so it must be written
  from the first status-change feature.

### Open questions
- No alerting on `app_errors` — accepted at two users (§7.7), revisit before real ones.
- The `rate_limits` fixed window allows up to 2x a limit across a boundary. Accepted; if abuse
  ever makes it matter, the table can hold one row per event instead.
- Nothing else structural. Remaining decisions are build-time judgement calls, not gaps the
  spec owes an answer to.

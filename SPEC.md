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
| name | string | defaults to `Custom N` if left blank — N is one more than the highest `Custom N` the user already has. Names need not be unique |
| statuses | enum[] | empty = all statuses |
| referral | `any` \| `yes` \| `no` | |
| starred | `any` \| `yes` \| `no` | |
| location | string \| null | null = `Any location`; otherwise exact match against normalized location |
| text | string \| null | matches company, position, location, description (§5.1); null = no text match |
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
  call it. Two writers means one will be forgotten. In the build that path is
  `services/change-status.ts`, calling the Postgres function `change_application_status`, which
  updates the status and appends the row in one transaction. The creation row comes from
  `create_application`, which inserts the application, that row, and any first note together.
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
Links to **Create one** (§4.1a) and **Forgot password?** (§4.1c). Until those screens are
built, the links are not rendered — a link to a screen that does not exist is a dead end
(§8.1).

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
- **Search** — substring match over company, position, location (§5.1). Resets to page 1. It
  shows a magnifier icon and the placeholder "Company, position, or location"; its "Search"
  label is for assistive technology only — the one input excepted from §10.3's visible-label
  rule, since a magnifier on a search field is a label people already read.
- **Filter tabs** — `All (n)`, then one per status with live counts, then any saved filters
  (each with its own count and an × to delete), then `+ Filter` which opens the filter builder.
  Every count covers the full application set, never the search (§5.3); while the list loads
  the tabs show no numbers and, like the search, are disabled. The tabs are toggle buttons in
  a labelled group, not ARIA tabs: they narrow one list rather than switch panels, and a saved
  filter's × is its own button beside the tab. `+ Filter` waits until saved filters have
  loaded, since the next "Custom N" depends on them.
- **Filter builder** (§5.1) — collapsible panel: name (blank becomes `Custom N`, and the field
  says which), text match, location, statuses, referral and starred (Any / only / not).
  Statuses start with none ticked, led by an **All** chip that is ticked when all six are,
  mixed when only some are, and ticks or clears all six at once; saving with none ticked says
  "Choose at least one status." All six ticked is stored as the empty list that means all (§2). Location is a combobox over the places the user's applications already use: typing
  narrows the list ("No location matches." when nothing does), and a place is picked from it —
  a filter's location must match exactly, so a place no application has could never match.
  An empty box, the default, is "Any location". Saving adds the tab, makes it the active filter, closes the panel, and returns focus to
  `+ Filter`; Cancel closes it without saving.
- **Sort** — date column header toggles newest ↔ oldest, chevron indicates direction. The column
  carries `aria-sort`, and the header is a button named for what it does ("Date, show oldest
  first"). Changing the order goes back to page 1 and is announced ("Sorted oldest first.").

The filter, the search, the order, the page, and the page size all live in the URL
(`?filter=Offer`, `?filter=<saved filter id>`, `?q=acme`, `?sort=date-asc`, `?page=2`,
`?pageSize=25`), each left out while at its default, so a list can be linked to and survives a
reload. Typing replaces the history entry rather than adding one per keystroke; every other
change adds one, so Back undoes it. A malformed value falls back to its default. A link to a
saved filter waits for saved filters to load; one that no longer exists, or belongs to someone
else, shows All. The rows shown are announced after each change of filter, search, page, or page
size (§10.4): "Showing 11 to 20 of 42 applications." when there is more than one page, "Showing
3 of 7 applications." for a narrowed list on one page, and "Showing 23 applications." for a whole
list that a change has brought onto one page (rows per page from 10 to 25, say). A list that has
only just loaded onto one unnarrowed page announces nothing.

Leaving the list for an application and coming back — the detail screen's "Back to applications",
the edit screen's links back, and the return after deleting from the detail screen — lands on
the list as it was left: the same filter, search, order, page, and page size. That memory lives
in the tab only, never in storage (it holds the search text), and belongs to the signed-in user.
The header's Home link opens the default list, and Add returns to it (§4.3).

Table columns: select checkbox · star · date · company · position · location · status tag · 📎
(cover letter present) · referral Y/N · chevron. Clicking a row opens the detail screen; clicking
the star or the checkbox acts on it without opening the row.

**Selecting rows to delete.** Each row has a checkbox, and the header has one that selects every
row on screen (mixed when only some are). Once any row is ticked, a bar appears above the list:
"*N* selected", **Clear**, and **Delete *N* applications**, which confirms first (§9.2). Only rows
on screen can be selected: select-all covers the rows on the current page only, and changing the
filter, the search, the order, the page, or the page size clears the selection. The selection is
screen state, not part of the URL, and leaving the list clears it.

Pagination below the table: rows per page (10 / 25 / 50, starting at 10), `x–y of n` range label,
First page (`«`) / Previous / numbered pages / Next / Last page (`»`). First and Last are
icon-only, named "First page" and "Last page" for screen readers and in a tooltip. Changing page size, the order, the search, or any filter resets
to page 1. The *n* is every application the filter and search let through, across all pages;
the tab counts stay over the whole set (§5.3).
- The pages are a `<nav>` labelled "Pages" of links, the current page marked
  `aria-current="page"` (§10.4). First and Previous on the first page, and Next and Last on the
  last, are shown but unavailable, and are not tab stops.
- Numbered pages show the first, the last, and the current page with its neighbours, with "…"
  for the rest. From seven pages up they are always exactly seven items, each as wide as the
  next, so the bar keeps one width and nothing beside it moves as the page changes: near either
  end the room goes to more pages (`1 2 3 4 5 … 25`, `1 … 11 12 13 … 25`, `1 … 21 22 23 24 25`).
  A "…" always stands for at least two pages; a single page is shown instead.
- Following a page link moves the view to the top of the list and focus to the list, whose name
  says which page it is ("Your applications, newest first, page 2 of 5").
- A page past the end — a stale link, or the last rows of the last page deleted — shows the last
  page, and the URL is corrected to match without a history entry.
- While the list loads, the pagination shows disabled with no range; in the empty, no-matches,
  and error states it is not shown.

A floating **Jump to bottom** pill appears on the list when more than ~100px of scroll remains.
It is a button after the list in the tab order. Pressing it scrolls to the bottom — instantly under
`prefers-reduced-motion` — and moves focus to the pagination, since the pill disappears once the
bottom is near.

Empty state when a filter or search matches nothing.

### 4.3 Add application
Fields: date (defaults to today in the user's own zone, §5.4), company*, position*, location (combobox — suggests existing
locations, accepts new), description, status (defaults Applied), referral toggle, cover-letter
attach, first note.

Validation: company and position required → "Company and position are required."
Save prepends the new application to the list and returns to the dashboard with filter reset
to All.

Cover letter attach: **Attach cover letter** picks a file, which is checked on choosing (the
§4.4 copy, shown under the field) and then shown with its name, size, and an **×** that clears
it, with **Choose a different file** below. Nothing is uploaded until Save, so clearing a chosen file needs no
confirmation. On Save the application is created first, then the file is uploaded and attached,
with "Uploading…" on the file's row and "Saving…" in the button. If the upload fails, the
application stays saved without it: the form goes to the new application's detail screen, where
"Upload failed." and Retry are shown (§8.2), with the toast "Application added, but the cover
letter didn't upload." Cancel with a chosen file asks before discarding, as it does for typed
changes (§9.1).

### 4.4 Application detail
Header: company, position, location, date, status tag, star.
Funnel indicator showing position across Applied → Interview → Callback → Offer.
Status selector — changing it updates the record immediately, which recalculates the tab
counts and the stats screen live.
Description, cover-letter file, referral flag, notes list with an add-note field.
Actions: edit fields, delete application (confirm first).

Cover letter: the original filename as a label, with the file's size and an **×** at the right
of that row that removes it (confirming first, §9.4), then **Preview** (a PDF only), **Download**,
and **Replace** — or "No cover letter attached." and **Attach cover letter** when there is none. A chosen file is
checked before upload, and the first failure is shown under the row (§7.3):
- type, by magic bytes — "Choose a PDF, DOC, or DOCX file."
- size — "Choose a file of 10 MB or less."
- over the upload rate limit (§7.1) — "You've uploaded a lot of files recently. Try again in an hour."

Success shows a toast: "Cover letter attached." / "Cover letter replaced." / "Cover letter
removed." Download asks for a 60-second signed URL when clicked, fetches the file through it,
and saves it under its original name (§7.3). The signed URL is never put in the page, and the
saved copy is typed `application/octet-stream`, so it can only be saved, never opened as part
of the app.

Preview opens a PDF in a new browser tab, in the browser's own viewer. The click opens a blank
tab, cuts its link back to the app (`opener`), then sends it to a fresh 60-second signed URL
*without* `download`, which Storage serves inline as `application/pdf` — so the file is shown on
Storage's origin, never the app's, and nothing in it can reach the session. The URL goes to that
tab only, never into the page. Whether a file is a PDF is read from its stored path's extension,
which the upload function chose from the bytes, not from the display name. A Word file has no
Preview: browsers cannot show one, and converting it into a page would put untrusted markup in
the app. Reloading the preview tab after the minute is up shows Storage's error, not the file.

### 4.5 Stats
Computed live from the user's full application set (§5.3) and its status history (§2).

Laid out as the prototype has it:
- a row of four cards — **Applications** (count), **Interviews** (count), **Callbacks** (count),
  and **Via referral** (the share of applications marked as a referral);
- under **How far applications got**, four rates — **Heard back**, **Interview rate**,
  **Callback rate**, **Offer rate** — each a percentage of all applications, rounded to a whole
  number;
- **Status breakdown**: a stacked bar with a text legend.

The funnel figures count **how far each application got**, not where it stands now — an
application that went Interview → Rejected still counts as an interview:
- **Interviews** — reached Interview, Callback, or Offer
- **Callbacks** — reached Callback or Offer
- **Offers** (shown only as the offer rate) — reached Offer
- **Heard back** (shown only as a rate) — reached Interview or beyond, or was rejected — the
  response rate

"Reached" is read by replaying the application's history, oldest first, and then its current
status:
- Moving forward reaches the new stage (Applied → Interview → Callback → Offer). A jump counts
  every stage it skips: Applied → Offer is also Interviewed and a Callback.
- Rejected and Withdrawn close an application without lowering anything. Rejected also counts as
  heard back; Withdrawn does not.
- **Moving back to an earlier stage is a correction.** The status was picked by mistake, so the
  stages above it stop counting: Offer → Interview is no longer an Offer, and moving back to
  Applied cancels heard back too, a rejection included. History is append-only, so this is the
  only way a mis-click can be undone in the numbers.
- An application with no history rows is measured by its current status alone.

Via referral reads the application's referral flag as it is now; it has no history.

The breakdown bar is by **current** status (segments proportional to count, colored per §3,
zero-count statuses omitted), with a legend naming each status and its count in text (§10.1).
It is the one place current status is used, because its segments have to add up to the total.

### 4.6 Profile
Avatar (click to upload a photo; "Remove photo" reverts to the initial), name, application
count, **Export my data** (§9.8), sign out, and **Delete my account** (§9.7) set apart
under its own heading — not another profile control, and not on the way to signing out.

The name is editable. "Edit name" beside it opens a labelled field holding the stored name,
with **Save** and **Cancel**; the heading stays on screen throughout, because it is the
screen's `h1` and what the profile section is labelled by. Focus moves to the field on
opening and back to the button on saving or cancelling. Saving shows "Name updated."

A new account has no name, and the name shown then is derived from the email — the local part
up to its first `.`, `_`, `+` or `-`, capitalised. **Emptying the field clears the name**
rather than failing: the column goes back to null, that derived name returns, and the toast
reads "Name removed." Cancel discards the edit and leaves the stored name alone.

Over 120 characters (§7.3) the field says "Keep this under 120 characters." and nothing is
written. A failed save keeps the field open holding what was typed, so Save is a retry with
nothing to retype (§8.2).

A chosen photo is checked before upload, in this order, and the first failure is shown under
the avatar (§7.3):
- type, by magic bytes — "Choose a PNG, JPEG, or WebP image."
- size — "Choose an image of 2 MB or less."
- dimensions — "Choose an image no larger than 4000 × 4000 pixels."
- over the upload rate limit (§7.1) — "You've uploaded a lot of files recently. Try again in an hour."

A refused photo leaves the current one in place. Success shows a toast: "Photo updated." /
"Photo removed." Replacing a photo deletes the old file after the new one is saved (§9.4).
Sign out ends this device's session only; ending every session is the password-change path
(§7.1).

---

## 5. Business rules

### 5.1 Filter matching
An application matches a saved filter when **all** of these pass:
1. `statuses` empty, or the application's status is in the list
2. `referral` is `any`, or matches the boolean
3. `starred` is `any`, or matches the boolean
4. `location` is `Any location`, or exactly equals the application's location
5. `text` is empty, or is a case-insensitive substring of any one of
   company, position, location, or description

The dashboard search box applies **on top of** the active filter and matches only
company, position, or location — case-insensitively, the same way.

Both text matches ignore the term's leading and trailing spaces, keep the spaces inside it, and
test each field on its own: a term never matches across two fields ("osoProd" does not find
Contoso / Product Engineer). An application with no location or description simply has nothing
there to match.

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

The Add form's default is **today in the user's own zone** — the calendar day they are living
in — which is then stored as UTC midnight of that day like any other choice. Taking "today"
from UTC would default to tomorrow from late afternoon onwards on the US west coast.

`created_at`, `updated_at`, `changed_at`, and note timestamps are genuine moments and stay
plain `timestamptz` in real UTC, formatted in the viewer's local zone. Only `date_applied`
gets the UTC-midnight treatment, because only it is a date the user chose rather than a time
something happened.

If the app ever gains reminders or "applied 30 days ago" nudges, revisit — those are moments,
and they need the user's zone stored on the profile.

### 5.3 Counts and sorting
Tab counts and stats always reflect the full application set for the user, never the current
page or search. Default sort is date descending.

Newest first is date applied, newest first (compared as UTC dates, §5.4); within one day the most
recently added first; then by id, so no two applications ever tie and none repeats or goes missing
between pages. Oldest first is exactly that order reversed, so the last page of one is the first
page of the other.

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

| setting | value | enforced by |
|---|---|---|
| Access token (JWT) lifetime | 1 hour | `config.toml` `jwt_expiry` |
| Absolute session cap | 90 days from sign-in, then full re-auth | `expire-sessions` pg_cron job |
| Idle timeout | 14 days without a token refresh | `expire-sessions` pg_cron job |
| On sign-out | this device's session deleted server-side, revoking its refresh tokens | Auth |

A refresh token has no lifetime of its own. It is rotated on every use and lasts exactly as
long as its session, so the two session limits above are the limits.

Supabase's own settings for them (`config.toml` `[auth.sessions]` `timebox` and
`inactivity_timeout`) are **Pro-plan only**. On the Free plan they are ignored and a session
never ends by itself. So migration `20260916175247_expire_sessions.sql` schedules an hourly
pg_cron job, run as `postgres`, that deletes every `auth.sessions` row past either limit.
Deleting the row deletes its refresh tokens with it, so the next refresh is refused and the
app returns to sign-in. Idle is measured from `refreshed_at` (falling back to `updated_at`,
then `created_at`). supabase-js refreshes about hourly while a tab is open, so "idle" means
no open tab for 14 days. A session can outlive its limit by up to an hour, because the job
runs hourly. After that, its last access token still works against the database for up to
another hour, because PostgREST checks the token's signature, not whether the session still
exists. `config.toml` keeps `[auth.sessions]` so the local stack, and a Pro plan if one ever
applies, behave the same way.

**Rate limits** — set these explicitly; do not accept provider defaults.

Each limit has exactly one home, chosen by what can actually observe the event. Anything
without a home is not a limit, it is a wish:

| limit | lives in | why there |
|---|---|---|
| Sign-in **per account** | `supabase/functions/sign-in` | must be recorded on a *failed* sign-in, which has no session and no trustworthy client |
| Sign-in **per IP** | `supabase/functions/sign-in` | behind the function, Auth sees one caller — the function — so only the function sees the user's address |
| Sign-up per IP, token refresh, verifications | `supabase/config.toml` `[auth.rate_limit]` | provider-side, per-IP by nature |
| Password reset + verification sends | `config.toml` `email_sent` + `max_frequency` | Auth owns the send |
| File uploads per user | `supabase/functions/upload`, counted as the user | the function is Storage's only writer and stores with the service role, so a `storage.objects` trigger could not tell whose upload it was |
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

A write counts once for each row the user writes, on every table a signed-in user can write:
applications, notes, saved filters, status history, and profiles. Rows a cascade removes along
with it — the notes of a deleted application — are part of that one action and are not counted,
and neither is the profile row an account's confirmation creates, which the user did not write.

Lockouts are per account **and** per IP — per-IP alone is trivially bypassed, per-account
alone allows targeted denial of service.

The per-account row, precisely: after one to four failures inside 15 minutes the sign-in
function waits 250 ms, doubling per failure, before checking the password; five failures
inside one 15-minute window lock the account for 15 minutes from the fifth. Only Auth
rejecting the credentials counts. Auth being rate-limited or down returns "unavailable" and
counts nothing, so an outage cannot lock anyone out; a failed read of the counter refuses
the sign-in rather than skipping the check.

The per-IP row, precisely: 20 failures from one address inside an hour block that address
until the oldest of them is an hour old — whatever account it tries, the correct password
included. Both counts are checked **before** Auth is called, so a blocked address never
reaches Auth; that matters because Auth's own `sign_in_sign_ups` limit counts the function's
address, making it one bucket shared by every user, which an attacker could otherwise drain
to lock everyone out. The address is the one the gateway vouches for — Cloudflare's
`cf-connecting-ip` hosted, Kong's `x-real-ip` locally; a client can set neither — and it is
stored only as a peppered hash. A successful sign-in clears the account's failures but
not the address's — one valid account must not reset an address that is spraying others.
Blocked responses carry the wait in minutes, and the body never says which limit tripped.

Both limits hold for attempts that arrive **at the same time**. In one locked transaction
(`begin_sign_in_attempt`), the database reads the counts, decides whether the attempt is
blocked, and records it as *pending* only if it is not. A pending attempt counts as a failure
for every later reader. Ten simultaneous guesses therefore see 0, 1, 2 … 9 attempts before
them, not ten copies of the same count. When the attempt finishes, its row becomes a failure or
a success. A blocked attempt writes **nothing**, not even for a moment: if it did, a caller whose
address is already blocked could keep five pending rows on someone else's account and lock its
owner out without a guess reaching Auth. The block rule therefore exists in SQL as well as in
`limits.ts` (which computes the wait), and an e2e test holds the two together. An attempt Auth
could not answer deletes its row and counts nothing; that write, like every write that settles an
attempt, is retried before giving up. A row left pending by
a function that died keeps counting as a failure until it ages out, so the limit fails closed —
except that a successful sign-in clears it with the account's failures once it is older than
any live request could be (7 minutes; hosted functions end at 150 s on Free, 400 s on paid).
Otherwise a user who had just signed in could be locked out by attempts that never finished.

**Accepted risk: Auth's password endpoint can be called directly.** The limits above bind only
callers of the sign-in function. Auth's own endpoint (`/auth/v1/token?grant_type=password`)
is public to anyone holding the anon key, which ships in the app bundle. A script calling it
directly skips the per-account lockout and the per-IP limit, and meets only Auth's
`sign_in_sign_ups` limit (20 per 5 minutes per address). With many addresses there is
effectively no limit. Nothing on the Free plan closes this:
- server-side auth leaves the endpoint public;
- Auth's password-verification hook is a paid-plan feature;
- the free access-token hook runs only after the password check, so it would still reveal a
  correct guess.

Only Auth's CAPTCHA would close it. Accepted for now because sign-up is closed (§4.1d), the
accounts are few and hand-made, and their passwords come from a password manager (12+
characters), which puts guessing out of reach even at thousands of attempts an hour.
**Revisit before sign-up opens**, the same trigger as §7.5. The path then is Auth's
Turnstile CAPTCHA, with the sign-in function forwarding the token. That has its own costs:
a CSP change, Cloudflare as a third party, test keys for the e2e session helper, and an
accessibility check.
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
- Signed-in users have **no** insert or update policy on either bucket, only select and delete
  on their own folder. Every file enters through the `upload` edge function, which checks its
  bytes first (§7.3) and chooses its path. A write policy added back would walk around that
  check.
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
| description | 15,000 characters |
| note body | 2,000 characters |
| saved filter name | 60 characters |
| profile name | 120 characters |
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
| Type check | verify magic bytes server-side — never trust the extension or the client's `Content-Type`. Done in `supabase/functions/upload`, Storage's only writer; each bucket's `allowed_mime_types` stays as a backstop, since it trusts the declared type |
| Stored filename | generate a UUID; keep the original name only as a display label, escaped |
| Storage path | prefixed with the owner's user id, e.g. `{user_id}/{uuid}.pdf` |
| Serving | private bucket, signed URL with a **60-second** TTL, generated on click — never embedded in page HTML |
| Download response | `Content-Disposition: attachment`, and the `Content-Type` the upload function sniffed from the bytes. The app fetches the file and saves it as `application/octet-stream` rather than opening the URL (§4.4). `X-Content-Type-Options: nosniff` is wanted but not required: Supabase Storage does not send it, and the rows above already do its job — see the 2026-09-12 changelog |
| Preview response (PDF only) | No `Content-Disposition`, `Content-Type: application/pdf`, served by Storage on its own origin in a tab opened with no `opener` (§4.4). Never offered for DOC or DOCX |

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
  request fails. It ships **enforced from the first deploy** — do not disable it when it
  breaks something. Check it locally before deploying: `npm run build && npm run preview`
  serves the build under the same policy, enforced (`vite.config.ts` reads it from
  `vercel.json`, so the two cannot drift). A Vercel build fails if the policy is missing,
  report-only, still holds the placeholder project ref, or allows a different Supabase
  project than `VITE_SUPABASE_URL`.
- **Session tokens in localStorage — accepted risk.** supabase-js keeps the access and refresh
  tokens in `localStorage`, where any script on the page can read them. A static app cannot
  hold them in an `HttpOnly` cookie: the browser calls Supabase directly and has to attach the
  token itself, so only a server in front of every Supabase call could keep it out of reach.
  What that trade costs: script injected into the page (XSS, a compromised dependency) could
  copy the refresh token and use it elsewhere, instead of only acting while the tab is open.
  A copied token works until its session ends (§7.1): the user signs out on that device,
  changes their password, or deletes the account; or the session reaches 90 days from
  sign-in or 14 days without a refresh. The thief's own refreshes count as activity, so a
  thief who keeps refreshing is stopped only by the **90-day cap** or one of the user's
  actions. The user carrying on with the app does not evict them either: Auth still accepts a
  refresh token one rotation behind (measured locally). Nothing bounds it at all on the Free
  plan without the `expire-sessions` job. After the session ends, the last access token the
  thief received still works for up to an hour. Accepted for two users, on three conditions:
  1. **The CSP ships enforced before any real user data exists.** Release blocker, not a
     follow-up — it stops injected script from running at all, which is the actual defence.
  2. The dependency tree stays small (§7.6) and no user content is rendered as HTML (§7.3).
  3. Revisit before sign-up opens (§4.1d). The path then is server-side auth
     (`@supabase/ssr`) behind Vercel functions.

  The cookie rule in the first bullet still governs any cookie the app does set.
- Also set: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` denying camera/microphone/geolocation.
- CORS restricted to known origins on every endpoint this project writes — the edge
  functions answer for `ALLOWED_ORIGINS` only (`supabase/functions/_shared/cors.ts`). No `*`,
  and no reflecting the request's `Origin` header back.

  **Accepted: Supabase's own APIs answer `*`.** The Data API, Auth and Storage send
  `Access-Control-Allow-Origin: *` (local Kong does; hosted gives no setting to narrow it).
  `*` is dangerous where the browser attaches credentials by itself — a cookie — so that any
  site's script can make a signed-in request. Here nothing is attached by itself: the page
  adds the token to each request from localStorage, so another site's script can send only a
  token it already holds, and CORS was never what stood in its way. **Revisit if the app ever
  authenticates with a cookie** — the server-side auth path this section names for sign-up.

### 7.6 Database and dependencies
- Postgres access through Supabase with RLS on (§7.2). No direct connection string in client
  code. Any server-side connection uses a least-privilege role, not the superuser.
- **Postgres functions and triggers:** avoid `SECURITY DEFINER`. Where it is unavoidable, pin
  `set search_path = ''` and schema-qualify every reference — an unpinned `search_path` on a
  definer function is a privilege-escalation path.
- Install extensions into a dedicated `extensions` schema, not `public`. The one exception is
  `pg_cron`, which ignores `WITH SCHEMA` and always installs into `pg_catalog`, with its jobs in
  its own `cron` schema. The rule's purpose still holds: neither schema is exposed through the
  API, and `anon` and `authenticated` have no usage on `cron`.
- Views that touch user data are `security_invoker = on`, or they silently bypass RLS.
- If Realtime is enabled, confirm its policies separately — a subscription is a read, and it
  needs the same RLS scrutiny as a query.
- Remove unused packages; keep the dependency tree small.
- Keep dependencies patched; run an automated vulnerability scan in CI and on a schedule.
- Enable point-in-time recovery / scheduled backups before real user data exists, and test a
  restore at least once. **PITR is a paid Supabase feature and no card goes on this project**
  (README, Deploy), so the scheduled half is met by `.github/workflows/backup.yml`: a nightly
  dump kept as a 90-day artifact. It is encrypted to an `age` public key on the runner before
  it is uploaded — this repo is public, and artifacts on a public repo are readable by anyone,
  so an unencrypted dump would publish the whole database. CI holds no key that can read its
  own backups. Losing a window of writes between nightly dumps is the accepted cost of not
  having PITR; revisit if the data ever justifies the plan. The dump is the database only:
  cover letters and photos live in Storage and are not in it, so losing the project loses
  them — accepted at two users, with the export (§9.8) as each user's copy. A restore is the
  migrations at the dump's commit, then its data (README, Deploy → Backups); tested once,
  2026-09-18.

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

- **`user_id` and `created_at` are never taken from the client.** A `default` is not enough:
  it fills a column the client left out, and says nothing about one the client sends. Both are
  **overwritten in a `before insert` trigger**, so what the client sent is discarded whatever
  it was. A client-supplied id is a forgery waiting to happen, and a client-supplied timestamp
  is worse than it looks — every guarantee below is computed from `created_at`. Backdate a row
  and the 60-an-hour cap never counts it; post-date one and the 90-day purge never reaches it.
  The service role is the only exception, and only for `security_events`: the sign-in function
  writes `sign_in_success` for a user who has no session yet, so forcing `user_id` there would
  erase the one thing the row is for.
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
  Both tables are purged after 90 days by a nightly `pg_cron` job at 03:00 UTC, an hour before
  the backup (migration `20260916170641`), so a dump holds only rows that passed 90 days since the
  purge — about an hour's worth, more if GitHub Actions starts the backup late. The same job
  deletes `sign_in_attempts` rows (peppered email and address hashes, §7.1) after 24 hours: the
  limits read at most the last hour, and sign-in outcomes stay in `security_events`.
- **If an in-app viewer is ever built:** render stack text as text, never with
  `dangerouslySetInnerHTML`. Stored error strings are attacker-influenced.

- **Log these security events:** sign-in success and failure, sign-out, password change,
  password reset request and completion, email change, rate-limit trip, permission denial
  (RLS rejection), file upload and delete, account deletion.
- **Each entry contains:** event type, user id (opaque UUID), timestamp, outcome. **No source
  IP, deliberately.** The browser writes most of these rows, and an address in them would be
  whatever the client claimed; the real one is already in Supabase's Auth and edge-function
  logs. Sign-in's per-IP limit keeps only a peppered hash, for 24 hours (§7.1).
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
   confirm the bucket is not publicly listable. While it is live, check the hosted response's
   headers: `Content-Disposition: attachment` and a `Content-Type` of PDF or Word. If either is
   missing or different hosted, the §7.3 nosniff acceptance no longer holds — reopen it. Then
   Preview a PDF: its URL has no `download`, the response is `application/pdf`, and the file
   shows in the new tab on the Storage origin.
4. Delete an application, then confirm its notes, history rows, and Storage object are all
   gone.
5. Five wrong passwords on one account, then a sixth attempt with the *correct* password —
   expect the lockout. Repeat with an email that has no account: expect the identical response
   — status, body, and timing. During the lock, the correct password and a wrong one must get
   identical answers too. The lockout copy itself is fine (§8.2): it is shown for any address,
   real or not, so it reveals nothing (§7.1). Automated in `e2e/sign-in-function.spec.ts`.
6. Load the deployed app with the CSP header **enforced** (not `-Report-Only`), sign in, open
   the profile, upload a photo. Expect no CSP violations in the console — the condition that
   makes localStorage tokens acceptable (§7.5).
7. From two different networks (home Wi-Fi, a phone on cellular), fail one sign-in on each,
   and check the same day (rows are kept 24 hours, §7.7).
   `sign_in_attempts` should hold two distinct `ip_hash` values for them. One value means the
   function is reading a proxy's address, not the caller's, and every user shares one
   per-IP bucket again (§7.1).

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
10. New file path: private bucket, written only through `supabase/functions/upload` (which
    brings the owner-prefixed path and the magic-byte check), signed URL on click.
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
| Application list | 5 skeleton rows in the table shell; controls visible but disabled, the pagination with no range | **No applications yet** — headline, one line of copy, "Add application" button; no pagination | "Couldn't load your applications." + Retry, no pagination. Keep header and nav usable |
| List, filtered | skeleton rows | **No matches** — name the active filter/search: "No applications in *Offer* match "acme".", "No applications in *Offer*.", or "No applications match "acme"." — and offer "Clear filters", which resets the filter to All and empties the search. A user with no applications at all sees **No applications yet** instead, whatever the filter | as above |
| Detail | skeleton of header, funnel, notes | n/a | "Couldn't load this application." + Retry + Back to list. If the id does not exist or is not the user's: "Application not found" + Back (never reveal that it exists but belongs to someone else) |
| Stats | skeleton bars at fixed height | **Nothing to chart yet** — "Add your first application to see stats." | "Couldn't load stats." + Retry, inline, list nav still works |
| Add / edit form | disable submit, spinner in the button, keep fields editable | n/a | Inline error above the form, field-level errors on the fields, **entered values preserved** — never clear the form on failure |
| Cover letter upload | progress indicator on the row: a spinner and "Uploading *name*…", the file controls disabled | n/a | "Upload failed." + error reference + Retry, which sends the same file again; a file being replaced stays in place. Application saves without the file rather than losing the whole record. A refused file (§4.4) shows its reason instead, with no Retry |
| Cover letter file (detail) | skeleton where the size goes | "No cover letter attached." + Attach cover letter | Size: "Couldn't load the file size." + Retry, name and actions still usable |
| Cover letter download | spinner and "Preparing…" in the button | n/a | "Couldn't download the cover letter." + error reference + Retry, which asks for a new URL |
| Cover letter preview (PDF) | a blank new tab at once; spinner and "Opening…" in the button until the URL arrives | n/a | The blank tab closes; "Couldn't open the preview." + error reference + Retry, which opens a new tab and asks for a new URL. A tab the browser blocks: "Your browser blocked the preview tab. Allow pop-ups for this site, or use Download.", nothing signed or reported |
| Cover letter remove | "Removing…" in the confirm button, dialog buttons disabled | n/a | "Couldn't remove the cover letter." + error reference inside the dialog; the file stays, and confirming again retries |
| Bulk delete (list) | "Counting their notes…" in the dialog, confirm disabled until counted; "Deleting…" in the confirm button, dialog buttons disabled | n/a | Stops at the first failure: "Deleted *n* of *m* applications. Couldn't delete *company*." + error reference inside the dialog; the rest stay selected, and confirming again carries on. Over the write limit: the wait-a-minute copy instead of a reference (§9.2) |
| Note add | optimistic append, muted until confirmed | "No notes yet." | Roll back the optimistic note, restore the text to the input, show "Couldn't save note." + Retry |
| Saved filters | n/a; `+ Filter` disabled until they load | "No saved filters yet" next to `+ Filter` | Fall back to the built-in status tabs; do not block the list. "Couldn't load your saved filters." + Retry beside `+ Filter`, which stays disabled; a linked saved filter shows All |
| Saved filter save | "Saving…" in the button, the builder's fields kept | n/a | "Couldn't save the filter." + error reference inside the builder, every choice kept. Over the write limit (§7.1): the wait-a-minute copy instead of a reference |
| Saved filter delete | the tab goes at once (§9.5) | n/a | The tab comes back, with the toast "Couldn't delete the filter." — plus the wait-a-minute copy when over the write limit |
| Sign in | spinner in the button, form disabled | n/a | Inline, above the form. Generic copy for bad credentials — never reveal whether the email exists. Blocked (account or address, never saying which): "Too many attempts. Try again in about N minutes." with the wait the function returns, or "Too many attempts. Try again later." when it gives none Network or server failure: "Couldn't sign you in. Check your connection and try again." with the error reference |
| Profile | skeleton of avatar, name, and count; sign out stays usable | n/a | "Couldn't load your profile." + Retry, sign out still usable. Photo upload: "Upload failed." + Retry, current photo kept. Count: "Couldn't load your application count." + Retry. Name save: "Couldn't save your name." + error reference, the field left open holding what was typed so Save is the retry — plus the wait-a-minute copy when over the write limit |
| Export my data | Progress in the button, which is disabled: "Preparing your data…", then "Adding files (*n* of *m*)…", then "Building your export…". The same words go to a live region (§10.4), and "Your export is ready." when the file is saved | n/a; a user with nothing still has a profile to export | "Couldn't export your data." + error reference + Retry, under the button. A file that will not download is **not** an error: the export still succeeds and names it in `export-errors.txt` (§9.8) |
| Delete account (dialog) | "Counting what goes…" in place of the sentence, confirm disabled until counted **and while an export started in the dialog is still running** (§9.8); then "Removing your files…" and "Deleting your account…" in the confirm button, with the dialog's other controls disabled and the same words in a live region (§10.4) | n/a | Stops where it failed, dialog open, confirming again carries on (§9.7). On Storage: "Couldn't delete your account. It and your data are still here, though some files may already have been removed. Try again." On the account: "Couldn't delete your account. Your files have been removed, but the account itself is still here. Try again to finish." Both with an error reference. A count that will not load does not block the delete: the sentence loses its numbers instead |
| Session expired | n/a | n/a | Redirect to sign-in with "Your session expired. Sign in to continue." Return to the previous screen after sign-in |
| Offline | n/a | n/a | Persistent banner: "You're offline. Changes won't save." Disable mutations |

### 8.3 Optimistic updates
Status change, star toggle, and note add update the UI immediately, then reconcile. On
failure: revert to the previous value, show a toast naming what failed, and leave the record
untouched. Never leave the UI showing a state the database does not have.

---

## 9. Edit and delete

### 9.1 Edit an application
Reached from the detail screen. Same fields and validation as Add (§4.3), pre-filled — except the
cover letter, which is attached, replaced, and removed on the detail screen itself (§4.4, §9.4).
- Location re-normalizes on save (§5.2).
- Changing status here writes a `status_history` row exactly as the detail-screen status
  selector does — one code path, not two. The database enforces it: a signed-in user cannot
  change a status with a plain update, add an application with a plain insert, or insert a
  history row; only `change_application_status` and `create_application` can.
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

**Deleting several from the list** (§4.2) follows the same rules, through the same one path,
one application at a time:
- The confirmation names them and what goes with them: "Delete 3 applications? Litware,
  Contoso, and Fabrikam. This also deletes 5 notes and 1 attached file. This cannot be undone."
  Past five names the rest are counted ("…, and 3 more"). A single selected application reads as
  the detail screen's does: "Delete your application to *Litware*?" The note count is read when
  the dialog opens; if it cannot be read, the dialog says "Their notes and attached files are
  deleted with them." rather than blocking the delete.
- It stops at the first failure rather than trying the rest, since most failures — the write
  limit above all — would refuse the rest too. What was deleted leaves the list; the dialog stays
  open on what remains, saying where it stopped: "Deleted 2 of 5 applications. Couldn't delete
  *Contoso*." with an error reference. Confirming again carries on.
- Each application deleted is one write against the limit (§7.1) — the notes that go with it
  are not counted — so deleting more than the limit at once is refused part-way. Then the dialog adds "You've made a lot of changes in the last
  minute. Wait a minute, then try again." and shows no reference, because nothing is wrong.
- On success: the dialog closes, the selection clears, focus moves to the list's heading, and a
  toast says "3 applications deleted." (or "Application deleted." for one). No Undo.

### 9.3 Notes
- Notes are individually editable and deletable from the detail screen.
- Edit is inline; save on blur or explicit Save, Escape cancels.
- Delete asks for confirmation only if the note is longer than a line — over 80 characters, or
  containing a line break; otherwise delete with an undo toast.
- Editing a note updates `updated_at`; display order stays by `created_at`.

### 9.4 Cover letter
- Replace: upload a new file, the old one is deleted from Storage after the new one commits.
- Remove: confirmation, then delete from Storage and clear the field.

How the build does it — attach and replace are one path (`services/attach-cover-letter.ts`),
remove another (`services/remove-cover-letter.ts`):
- The row is written only if it still holds the file the change started from. The old object is
  deleted on the strength of that write, so if another tab replaced or removed the file first,
  the write fails and nothing is deleted.
- If the row write fails after the upload, the new object is deleted: nothing points at it.
- Remove clears the field **first**, then deletes the object — a row pointing at a deleted file
  is a broken record, a file no row points at is an orphan. The confirmation dialog names the
  file: "Remove the cover letter? This deletes *name* from this application. This cannot be
  undone."
- A failed delete of the old or removed object does not fail the change that has already
  committed: it is reported for cleanup, as in §9.2.
- The filename stored as the label drops any path segments, control characters, and
  bidirectional-override characters (which can disguise an extension), collapses whitespace,
  and is shortened to the column's 255 characters keeping its extension. React escapes it on
  render; nothing else about it is trusted.
- The size shown is read from Storage's own record of the object, not stored on the row.

The profile photo (§4.6) is replaced and removed by the same rules: the profile is written only
if it still holds the photo the change started from, a new file nothing points at is deleted,
and removal lets go of the profile before the object.

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
- One code path, `services/delete-account.ts`, mirroring §9.2. The `auth.users` delete needs
  the `service_role` key, which the browser must never hold (§7.4), so it goes through a third
  edge function, `supabase/functions/delete-account`. The function takes no id: whose account
  goes comes from the token Auth vouches for, so it cannot be aimed at anyone else. Storage is
  *not* its business — the user already holds delete on their own folder, and the client must
  finish there before the function is called.
- Writes a `security_events` row (`account_deletion`) — the one record that survives, holding
  a user id and a timestamp and nothing else. It is written **inside the edge function, with
  the service role**, after the delete succeeds: only then is it true, and only the service
  role can name a user who no longer exists (`force_security_event_owner` exempts it).
  `security_events.user_id` therefore has **no** foreign key to `auth.users`; it keeps an
  opaque UUID for the table's 90-day retention. `app_errors.user_id` is still
  `on delete set null`, so stack traces keep their traces and lose the person.
- **The export offered here is not overtakeable.** While an export started in the dialog is
  running, the confirm is disabled: destroying the account mid-export would strand its files in
  `export-errors.txt` and then discard the zip on the way out, which is the exact opposite of
  offering a way out. Closing the dialog does not cancel or lose a running export — the file is
  saved by the export itself, not by the button that started it.
- **A retry has to be able to finish.** Failing on Storage leaves the account and all its data
  intact; failing on the account leaves the files gone and the account present — the §9.4
  broken-record shape, and unavoidable given the order. The dialog says which of the two
  happened rather than a flat "failed", stays open, and confirming again carries on: removing
  an object that is already gone is not an error on this path.
- Signs out all sessions and returns to sign-in with "Your account and data have been deleted."
  Deleting the user revokes every refresh token server-side, which *is* signing out
  everywhere; what remains is clearing this browser, so the sign-out afterwards is local.

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
- One accepted exception to the 3:1 boundary rule: the delete button’s light red fill, which
  measures 1.6:1 against the card. A red light enough to read as light cannot clear 3:1, and
  the control is identified by its label and shape rather than its edge; its text is at 10.2:1.
- Status is never communicated by color alone: every tag carries its text label, and the stats
  breakdown bar has a text legend with counts. The legend is what carries the breakdown, not
  the bar: the four light status fills measure 1.2–1.4:1 against the card, so segments are not
  distinguishable by contrast alone. The bar is decoration of the legend, hidden from assistive
  technology.
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
- Every input has a persistent visible label — placeholder text is not a label. One exception:
  the dashboard search, whose magnifier icon stands in for the word (§4.2).
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
  phone. Each application renders as a card: select checkbox at the left, company and position
  stacked, star at the top right, then a metadata row of status tag, date, location,
  cover-letter and referral marks. Nothing is dropped, it is re-ordered by importance. With no
  header row to hold select-all, the selection bar offers **Select all *N*** instead.
- **Sort moves out of the table header** into its own control above the list, labelled
  "Newest first" / "Oldest first" rather than an unlabelled chevron. The words are the order in
  effect; screen readers hear "Sort by date: Newest first", so they read as the order, not the
  action.
- **Numbered pages are hidden**; the range label remains, and the pages read
  `«  ‹  Page 12 of 25  ›  »` — First, Previous, where this is, Next, Last. Ten numbered targets do
  not fit at a usable size, so First and Last are the way to either end. Previous and Next are
  chevrons here rather than words, still named "Previous" and "Next" for screen readers: with the
  words, the row does not fit on one line beside 44px targets at 360px, let alone 320px.
- **Controls go full-width and stack** — search above the add button, both edge to edge.
- **Control height goes 36px → 44px** for every input, select, and button; the star tap area
  is a 44×44 box around a 19px icon.
- Stats cards go from four columns to two. Detail, add, and stats panels drop their fixed
  max-width and their padding tightens.
- Page padding tightens to 14px, and bottom padding grows so the floating jump pill never
  covers the last row.

Unchanged on mobile: the filter tabs' layout (they already wrap), the filter builder, and every
business rule. Their controls still grow to 44px like every other: each tab is 44px tall, and a
saved filter's × is a 44×44 target of its own. This is a layout response, not a reduced feature set — no "view on desktop for more".

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

### 2026-09-21
- **The profile name is editable (§4.6).** It was specified as a field the profile *shows* and
  the column has existed since the first migration, but nothing ever set it: every account read
  as the local part of its email, which on the hosted project means the user's address is what
  the header says. The field edits the stored name, not the derived one — starting from the
  derived name would quietly adopt it as a chosen name the first time anything was saved — and
  emptying it clears the column back to null rather than failing, so the derived name is
  reachable again. Capped at 120 characters, which is where `profiles_name_len` already capped
  it; §7.3's table was simply missing the row.
- **`profiles` joined the tables the write limit counts (§7.1).** The trigger covered four
  tables and not this one, because its only write was the avatar path, already held down by the
  20-uploads-an-hour limit above it. An editable name is a write with nothing above it, so
  without this it would have been the one client write nothing counted. It adds no new limit:
  the same bucket, the same 120 a minute, and `consume_rate_limit`'s list of accepted limits is
  unchanged. Deciding it now rather than later was the cheaper order — whether the write can be
  refused is what decides whether the mutation maps the refusal and whether §8.2 needs the
  wait-a-minute copy, so leaving it out would have meant revisiting all three.

### 2026-09-18
- **The sign-in function reads the caller's address from `cf-connecting-ip` hosted (§7.1).**
  Found by §7.8 check 7 on the first deploy. Hosted, there is no `x-real-ip`, and the fallback —
  the last `x-forwarded-for` entry — is an AWS load balancer that changes with every request.
  Six failed sign-ins from one machine were stored as six addresses, so the 20-an-hour address
  limit could never trip: one machine could spray every account, held back only by each
  account's own lockout. Measured with a throwaway function that echoed the headers:
  Cloudflare sets `cf-connecting-ip` and refuses a request carrying its own, forged
  `x-forwarded-for` and `x-real-ip` are discarded, and `true-client-ip` passes through
  untouched, so it is never read. Locally, where there is no Cloudflare, `x-real-ip` still
  decides. Everything local had passed because Kong does write `x-real-ip`; the
  check existed for exactly this.
- **A restore is the migrations, then the data — not the dump's own schema (§7.6).** The first
  restore test found that `schema.sql` comes back without everything Supabase keeps outside
  `public`: the four storage policies, the `auth.users` trigger that creates a profile, and all
  three pg_cron jobs. Nothing would have failed loudly — files would be unreadable, new users
  would have no profile, and sessions and logs would never expire. Restoring the migrations at
  the commit the dump records, then `data.sql`, matched the live project on every count and
  object checked. The same test made plain that files are not in the dump at all; that is
  accepted at two users and now written down rather than assumed.

### 2026-09-17
- **The log tables take `created_at` from the server, not the client (§7.7).** Found by the
  pre-deploy audit. Both tables defaulted the column and left it writable, and both of §7.7's
  protections are computed from it, so one extra field in a request body defeated them. The
  error-report cap counts rows whose `created_at` falls inside the last hour: a backdated row
  never counted, and 250 of them were accepted against a limit of 60 — the render-loop
  denial-of-wallet the cap exists to stop. And `purge_old_logs` deletes rows *older* than 90
  days, so a post-dated row was never purged and kept its user id for as long as the database
  lived, in every nightly backup with it. `user_id` was already overwritten in a trigger;
  `created_at` now is too, which is why §7.7 no longer says a `default` is enough for either.
- **`consume_rate_limit` accepts only the limits §7.1 actually defines (§7.1).** Found by the
  same audit. `public.rate_limits` is described as reachable only by the definer functions and
  the service role, and RLS does deny the table — but the function itself has to stay callable
  by `authenticated`, because the write and security_event triggers run with invoker rights and
  call it as the user. PostgREST exposes it like any other, so a signed-in user could pick the
  bucket, the limit and the window; verified with nothing but the anon key and a token. Each
  distinct bucket and window is another row, so that was unbounded growth in a table on a
  500 MB database. The arguments are now checked against §7.1's three limits. Spending one's
  own budget through it is still possible and still fine.
- **Confirm dialogs get phone-sized controls (§11).** Found by a review of the mobile pass.
  Every dialog that confirms something irreversible — deleting an application, deleting
  several, discarding an edit, removing a cover letter, deleting the account and its typed
  confirmation field — drew its buttons at 32px on a phone, well under the 44px §11 requires,
  because they reach the button through a wrapper that the mobile pass did not touch. The
  wrappers now carry the size, so a sixth dialog cannot be missed the same way.
- **Hitting the write limit now says to wait, wherever it happens (§7.1, §8.2).** Found by a
  review of the data layer. Only deleting an application from the list and saving a filter
  recognised the limit's refusal; starring, changing a status, adding or editing a note,
  attaching a cover letter, saving the form and deleting from the detail screen all treated it
  as a bug in the app — written to `app_errors` and shown as a generic failure with an error
  reference to quote, when the user had simply worked faster than 120 writes a minute and
  needed to be told to wait. Every write now reports the refusal the same way, decided once in
  the data layer instead of per call site.
- **A refused request can no longer take sign-in down for everybody (§7.1, §8.2).** Found by a
  review of the three edge functions. Sign-in answered any method other than POST without
  reading the request's body, and the edge runtime never completes a response sent over an
  unread body: the worker stuck on it stopped the function starting again, so every sign-in
  after one such request failed until the container was recreated — one unauthenticated PUT,
  and nobody could get in. Draining before answering now has one home the three functions
  share, and it covers preflights and every refusal, not just the ones someone remembered.

### 2026-09-16
- **Deleting an application with many notes no longer fails (§7.1, §9.2).** Found in a
  whole-repo code review. The write limit counted every note the delete's cascade removed, so
  an application with about 120 notes cost more than a minute's limit to delete and was refused
  every time, with no way out short of deleting the account. A cascade is now part of the one
  write that started it.
- **The one status-change path is enforced by the database (§9.1).** From the same review. The
  table permissions the two status functions need also let a signed-in client change a status
  with a plain update, add an application with no creation row, or insert history rows with any
  statuses and dates — skewing stats with history that cannot be corrected. Triggers now refuse
  all three unless the write comes from inside one of the two functions. They run after
  row-level security, so the ownership policies still answer first.
- **`security_events` inserts are limited to 60 an hour per user (§7.7).** From the same review.
  §7.7 asks it of both client-written log tables, and only `app_errors` had it, so a loop could
  fill the table and bury real events. Events the edge functions write are not counted.
- **Replacing or removing the profile photo checks it has not changed first (§4.6, §9.4).** From
  the same review. With two tabs open, a replace in one could leave the other's new photo in
  Storage with nothing pointing at it, until the account was deleted. The profile now takes the
  cover letter's guard.
- **The CSP ships enforced from the first deploy, and a Vercel build checks it (§7.5).** Found in a
  second whole-repo security review. "Report-only first, then enforce" left the release blocker
  as a README step: deploying master as it stood would have shipped a policy that enforced
  nothing, pointed at a placeholder project. Report-only was for learning what the policy
  breaks, and `npm run preview` already shows that locally under the enforced policy, so the
  stage bought nothing. The build now refuses a missing or report-only policy, the placeholder
  ref, and a policy naming a different Supabase project than the bundle calls.
- **Two §7 lines now match what was built (§7.5, §7.7).** From the same review. §7.5 forbade
  `*` CORS on any authenticated endpoint, but Supabase's own APIs send it and cannot be told
  otherwise; it is recorded as accepted, because the token is attached by the page rather than
  sent as a cookie, with cookie auth as the trigger to revisit. §7.7 listed source IP in every
  security event, while `security_events` has had no IP column since it was created, for a
  reason only its migration gave: a client-written address is worthless.
- **Direct calls to Auth's password endpoint are recorded as an accepted risk (§7.1).** Found
  in the same review. Anyone holding the anon key can call Auth's password endpoint without
  going through the sign-in function, skipping both of its limits. Nothing on the Free plan
  closes that except CAPTCHA, which was deferred for its costs. It is accepted while sign-up is
  closed and the passwords come from a password manager, and revisited before sign-up opens.
- **The sign-in limits now hold under concurrent requests (§7.1).** The function read the
  failure count, called Auth, and only then recorded the failure, so simultaneous attempts all
  read the same count and all got a guess. `begin_sign_in_attempt` now reads the counts, decides
  the block, and records an unblocked attempt as pending, in one locked transaction. Deciding the
  block there, before any write, keeps a blocked caller from adding to another account's count
  (found in review). Ten concurrent calls were measured
  seeing 0 through 9 earlier attempts; the same function without its locks let three of them
  read the same count. The local edge runtime answers sign-ins one at a time, so the race never
  showed locally.
- **`sign_in_attempts` is purged after 24 hours (§7.7).** Nothing deleted from it before, so
  every attempt's email and address hashes were kept forever. It joins the nightly log purge.
- **Session limits are now enforced by a pg_cron job (§7.1, §7.5).** Found in the same review.
  `config.toml`'s `[auth.sessions]` 90-day cap and 14-day idle timeout are Pro-plan settings,
  and on the Free plan Supabase refresh tokens never expire. That made both limits unmet
  hosted, and made §7.5's "until it expires" wrong: a copied refresh token would have worked
  indefinitely. An hourly job now deletes sessions past either limit, which revokes their
  refresh tokens (verified locally against a throwaway user, for each limit and just inside
  both). The "refresh token 30 days, sliding" row is gone: a refresh token lasts as long as its
  session, so the idle cutoff was always the real limit. §7.5 now says what actually bounds a
  stolen token. A second daily job keeps `cron.job_run_details` to 30 days, which the hourly
  job would otherwise grow without end.
- **The 90-day log purge now actually runs (§7.7).** Found in a whole-repo security review.
  `purge_old_logs()` existed from the start, but only a comment said to schedule it, so once
  hosted every `app_errors` and `security_events` row would have been kept forever, user ids
  included. A `pg_cron` job (on the Free plan, and a migration rather than a dashboard setting)
  runs it nightly at 03:00 UTC, an hour before the backup. `pg_cron` is recorded as the one
  extension outside the `extensions` schema (§7.6): it installs only into `pg_catalog`.
- **`anon` can no longer call `purge_old_logs()` or `consume_rate_limit()`.** Supabase grants
  new functions to `anon` directly, so `revoke … from public` left them callable by anyone
  holding the anon key. Neither call did harm (the purge deletes only rows already due, and
  `consume_rate_limit` does nothing without a user), but "deny unless explicitly authorized"
  (§7.2) is the rule. Fixed in the original migrations, which have not been applied anywhere
  hosted.

### 2026-09-15
- **The deletion dialog now waits for what it is holding (§8.2, §9.7, §9.8).** Found in review.
  Three async things run in that dialog — the counts, the export, the deletion — and the confirm
  only knew about the last. It could destroy the account while the counts still read "Counting
  what goes…" (which §8.2 had already forbidden in writing), and while the export that is the
  user's only way out was still fetching. Saving the zip also moved out of the button's
  `mutate()` callback and into the export itself, because closing the dialog unmounts the button
  and React Query drops call-level callbacks — a finished export was being discarded with no
  download, no error, and nothing said.
- **§6 step 7 finished: account deletion (§9.7), built after export.**
- **Deletion runs through a third edge function (§7.4, §9.7).** Removing an `auth.users` row
  needs the service role, and the browser must never hold it, so `supabase/functions/delete-account`
  joins `sign-in` and `upload` as the places that key exists. A `SECURITY DEFINER` Postgres
  function deleting from `auth.users` was the alternative and was rejected: §7.6 says avoid
  definer functions, and those tables are GoTrue's — anything its own delete does beyond the row
  cascade would silently become ours. The function takes no id; the token says who.
- **§9.7 contradicted itself about the surviving record, and the schema has been corrected.**
  It asked for one row that outlives the account "holding a user id and a timestamp", while
  `security_events.user_id` was `on delete set null` — so the cascade blanked the id on the very
  row that exists to name it, and it could not be inserted afterwards either, because the foreign
  key would reject an id no longer in `auth.users`. The constraint is dropped (migration
  `20260915192815`); the column keeps an opaque UUID that resolves to nothing. The trade, stated
  plainly: every `security_events` row now keeps its user id for the table's 90-day retention
  rather than losing it the moment an account goes — which is what makes "what happened to this
  account before it was deleted" answerable at all. `app_errors` is unchanged and still nulls.
- **The record is written by the function, after the delete succeeds.** Written before it, the
  row would claim a deletion that might then fail; written by the client after it, there is no
  `auth.uid()` left. The service role has both properties, and `force_security_event_owner`
  already exempts it for exactly this reason (the sign-in function writes for a user with no
  session).
- **The dialog says which half failed, because they leave different worlds (§8.2, §9.7).** Files
  go first so a failed Storage delete stops before the account is gone and a retry still works;
  the cost is that a failure *after* the files leaves rows pointing at objects that no longer
  exist. Rather than a flat "failed", the copy says whether the account is still whole or only
  its files are gone, and confirming again carries on — re-removing an object that is already
  gone is not an error on this path.
- **The deletion dialog's counts are counted when it opens (§9.7).** §9.7 did not say where
  "N applications, N notes, N files" comes from. Three head counts, never cached across the
  dialog, so the number shown before an irreversible act is the number that is true now; files
  are the cover letters plus the avatar, which is exactly what the export puts in `files/`, so
  the two agree. As in §9.2, a count that cannot be read does not block the delete.
- **§6 step 7 begun: data export built first (§9.8).** Export ships before deletion, as §6 and
  §9.8 require — deleting without an exit is a hostage situation, so the way out exists before
  the door closes.
- **The zip is built with `fflate`, synchronously (§7.5, §7.6).** Its async API builds a worker
  from a `blob:` URL, and the §7.5 policy has no `worker-src`, so the fallback to
  `default-src 'self'` refuses it; `zipSync` avoids the worker and keeps that code out of the
  bundle. fflate has no `eval` or `new Function`, so it does not repeat the problem Zod's JIT
  caused. Cost, measured: +5.6 KB gzipped for the library and the whole export feature together.
  JSON is deflated and stored files are not — PDF, DOCX, PNG, JPEG and WebP are already
  compressed. `zipSync` holds the whole zip in memory; at the §7.3 file caps a user with
  hundreds of megabytes of letters would need fflate's streaming `Zip` instead, which is the
  day to revisit.
- **The avatar is fetched through the authenticated client, not a signed URL (§9.8).** §9.8 said
  every file came through "the same 60-second signed URLs the detail screen uses", but the detail
  screen has never fetched the avatar that way: private-bucket images are downloaded and rendered
  as `data:` URLs so that nothing fetchable sits in the page. Cover letters do use signed URLs, as
  specified. An export is not a reason to open a second path to an image.
- **`export-errors.txt` is written only when something was skipped (§9.8).** §9.8 says the zip
  "includes" it; an empty errors file in every export teaches people to ignore the one that
  matters. Files inside `files/` keep their stored names (`{uuid}.ext`), and `applications.json`
  connects them through the `cover_letter_path` and `cover_letter_name` each row already holds —
  original names can collide and can carry path characters.
- **Export gets no rate limit of its own (§7.1).** Every §7.1 limit is a write, a sign-in, an
  upload, or an error report. An export reads rows the user can already select and asks for one
  signed URL per file; it never reaches `consume_rate_limit`, and a bucket for it would be a
  second enforcement point for nothing. The button being disabled while it runs is what bounds it.

### 2026-09-14
- **§6 step 6 built: sort and pagination, with pages cut in the browser (§4.2, §5.3).** The list
  already reads every application for the tab counts (2026-09-13), so sorting and paging happen
  over that same set rather than asking the database for one page at a time. One matching rule
  (`domain/filters.ts`) then produces the tab counts, the range's *n*, and the rows, so they can
  never disagree; paging from the database would have needed each saved filter rewritten as a
  query, a second copy of the rules that Postgres and JavaScript would not match identically (case
  folding), and a count request per tab. A Postgres function that filters and counts was considered
  and not built ahead of need: unused, it would speed nothing up and drift from the rules the app
  runs. When to revisit, and in what order, is under Open questions.
- **Order, page, and page size join the filter and search in the URL (§4.2).** §4.2 named only the
  filter and search; the build conventions already listed all five. A page to come back to after a
  reload or a shared link is the same need the filter had. Page size starts at 10, as in the
  prototype, and is not remembered between visits.
- **A total order, and what resets and clears (§4.2, §5.3).** Pages cut from an order with ties
  could show a row twice or never; within a day the order now falls back to when the application
  was added, then its id. Oldest first is the exact reverse. The order, like the page size, resets
  to page 1 (the prototype did), and a change of order clears the selection, since the rows on
  screen change.
- **What §4.2 left open about pages.** A page past the end shows the last page rather than "No
  matches" while earlier pages hold rows. Numbered pages are windowed: the prototype showed every
  number, which at the 5,000 soft cap is 500 of them. Following a page link moves focus to the new
  page's start, since otherwise a keyboard user is left at the bottom of it; Jump to bottom moves
  focus to the pagination for the same reason, and appears on the list only, where §4.2 puts it.
- **Pagination gains First page and Last page arrows (§4.2, §11).** Asked for. On a desktop the
  first and last numbers are already always shown, so the arrows repeat them there; on a phone,
  where the numbers are hidden, they are the only way to either end without paging one at a time.
- **The page numbers keep one width, and a phone names the page (§4.2, §11).** Asked for, after
  seeing 25 pages: the numbers ran four to seven items wide depending on the page, so First and
  Previous shifted under the pointer while paging. They are now always seven slots of equal width.
  A phone showed only "111–120 of 250", leaving the page number to be worked out, so it now says
  "Page 12 of 25" — and Previous and Next became chevrons there to fit it on one line at 320px,
  measured: 357px wide with the words against 292px available.
- **A seventh local seed user, `dev-g`, for the pagination tests.** No other seed user has more
  than one page of applications, and creating 23 during a run would spend most of `dev-d`'s write
  limit (§7.1). Read-only, so its tests run in parallel in both browsers.
- **Pagination measured, and form-control borders darkened a step (§10.1).** The current page's
  edge, the select, the phone sort control, and the Jump to bottom pill sit on the page background,
  where the form-control border measured 2.97:1 — under the 3:1 a control boundary and a state
  indicator need; the search box had the same shortfall since step 5. The border token darkened
  from 0.65 to 0.63 lightness: 3.2:1 on the page, 3.5:1 on a card. Page numbers are 6.9:1 (current
  15.1:1), the pill's text 9.0:1, and the focus ring 4.6:1 on the page.
- **Selects are 44px tall on phones (§11).** The status select and the new rows-per-page select
  measured 32px below 760px: the generated component's own height outranked the phone height.
  Found by measuring the new control; the status select had been short since step 2.
- **Back to applications returns to the list as it was left (§4.2).** It went to the default list,
  which lost the filter since step 5 and, with pages, the page too: open the 23rd application,
  come back, and land on page 1. Kept in memory rather than `sessionStorage`, because the search
  is user content; a reload of the detail screen goes back to the default list.
- **Cover letters gain Preview, for PDFs only, in a new tab (§4.4, §7.3, §8.2).** Asked for. Word
  files get none: browsers cannot show them, and converting one to HTML would mean rendering
  untrusted markup in the app, behind a sanitiser, with an approximate layout and still nothing
  for `.doc`. A new tab rather than a dialog: phone browsers show a PDF in a frame as its first
  page or not at all. The tab is sent to a signed URL Storage serves inline, not a `blob:` URL of
  the fetched bytes, so the PDF renders on Storage's origin rather than the app's — where the
  session token lives — and the CSP's `object-src 'none'` is not in its way. Costs: the signed URL
  shows in that tab's address bar for its 60 seconds, and reloading the tab after that fails.
- **The builder's statuses start with none ticked (§4.2).** Asked for, reversing the all-ticked
  default of 2026-09-13. An empty set is still refused with "Choose at least one status." rather
  than taken to mean all: the reason for refusing it has not changed, and All is one click.

### 2026-09-13
- **§6 step 5 built: search, filter tabs with live counts, saved filters.** The list now reads
  every application, a page at a time past PostgREST's `max_rows` of 1,000, and filters in the
  browser. §5.3 wants counts over the whole set and every saved filter's tab has a count, so the
  whole set is needed anyway; a single request would have miscounted — and silently dropped
  rows from the list — past 1,000 applications, under a 5,000 soft cap. Step 6 can revisit.
- **Filter controls measured (§10.1).** The active tab is edged in the tabs' text colour, 7.4:1
  against the tab well: the form-control border first used there measured 2.7:1, under the 3:1
  a state indicator needs. Inactive tab text and the × are 7.4:1 on the well, a chosen status
  chip's outline 5.1:1 and an unchosen chip's border 3.3:1 on the card, the focus ring 4.2:1 on
  the well, and "Couldn't load your saved filters." 4.8:1 on the page.
- **A sixth local seed user, `dev-f`, for the tests that save and delete filters.** The tests
  that read filters assert `dev-a`'s exact tab counts and seeded saved filters, and run in
  parallel.
- **The builder's statuses gain an All chip and start all ticked (§4.2).** Asked for, in place of
  the "(none = all)" hint. Without the hint an empty set of chips reads as "nothing", so the
  default is every status ticked and an empty set is refused rather than silently meaning all.
  The stored row is unchanged: all six are saved as `{}`, as before.
- **The filter builder's location is a combobox you type into (§4.2).** First built as a plain
  list, like the prototype's; asked for, because with many cities scrolling a list to find one
  is slow. Typing only narrows the places already used — it cannot enter a new one — because a
  saved filter's location matches exactly (§5.1), and a place no application uses could only
  ever match nothing.
- **The filter tabs are toggle buttons, not ARIA tabs (§4.2).** A saved filter's tab carries an
  ×, and a tab cannot contain another control; nor do the tabs switch panels — they narrow one
  list.
- **Filter tabs grow to 44px on phones (§11).** §11 said the tabs were unchanged on mobile, and
  also that every control is 44px there, which §7.9 checks. The layout is unchanged; the height
  is not.
- **The search box is labelled by its magnifier, not a visible word (§4.2, §10.3).** First
  built with a visible "Search" label, because §10.3 says a placeholder is not a label; asked to
  remove it as clutter beside the box. The magnifier icon inside the field is the recognised
  mark of a search box, and it stays when the placeholder is replaced by typing, so §10.3 gains
  this one exception. Screen readers still hear "Search". The placeholder names location too,
  which the prototype's "company or role" had left out.
- **What a saved filter's failures look like (§8.2).** Only loading was specified. A failed
  save keeps the builder's choices, like the application form; a failed delete puts the tab
  back, since the delete showed at once. A link to a saved filter that cannot be found — gone,
  someone else's, or not loaded — shows All rather than an error, since nothing is broken.
- **"No matches" copy and what Clear filters clears (§8.2).** The row said to name the filter
  and search without saying how; Clear filters resets both, since either can be what excluded
  everything.
- **Text matching tests each field on its own, ignoring case (§5.1).** §5.1 matched a saved
  filter's text against `company + position + location + description` joined together, which
  taken literally finds a term straddling two fields ("osoProd" in Contoso / Product Engineer),
  and it never said whether the search box ignores case. Both now match inside any one field,
  case-insensitively, with the term's outer spaces trimmed.
- **"Custom N" counts up from the highest one in use (§2).** The prototype's counter lived in
  memory and reset on reload; counting the user's filters instead would hand out a name that
  already exists after a delete.
- **Several applications can be deleted at once from the list (§4.2, §8.2, §9.2, §11).** Asked for
  directly: deleting one at a time meant opening each record. It goes through the one delete path
  per application, so Storage cleanup and the §7.8.4 check still cover it. It stops at the first
  failure instead of pressing on, because the likeliest failure is the per-user write limit —
  which cascaded notes count against — and every later delete would be refused the same way.
  Selection is limited to rows on screen, so a future filter can never hide what is about to be
  deleted.
- **Stats count the furthest stage an application reached, from its history (§4.5).** §4.5
  defined every stat by current status, while §6 step 4 said to rebuild stats from the history
  and nothing said what a history-based stat was. By current status, good numbers fell when bad
  news came in — an interview that ended in a rejection stopped counting as an interview, and an
  offer turned down stopped counting as an offer or even as heard back. Reached stages only grow.
  Because a mis-picked status is saved at once and history cannot be edited, a move back to an
  earlier stage is read as a correction. The breakdown bar stays by current status, since it has
  to add up to the total.
- **The stats screen follows the prototype's layout, and gains Via referral (§4.5).** §4.5 had
  listed four stats "each as a count plus a percentage", which was built first and did not match
  the prototype: its first row is Applications, Interviews, Callbacks, and Via referral, and its
  second is four rates. §1 says this document describes the prototype, so the missing referral
  stat was a gap in §4.5, not a decision. What the prototype's layout gives up is a count for
  offers and for heard back — those show only as rates; the breakdown legend still gives exact
  counts by current status.
- **The stats bar's segments are decoration; its legend is the content (§10.1).** Measured, the
  light status fills are 1.2–1.4:1 against the card — under the 3:1 a meaningful graphic needs,
  and a fill dark enough to pass would break the §3 tag pairings. The legend already names every
  status and count, so the bar is hidden from assistive technology rather than retinted. Each
  legend entry has a swatch of its colour, edged at 3.3:1 so the light ones show, as the key.

### 2026-09-12
- **Job description cap raised from 5,000 to 15,000 characters (§7.3).** A pasted job listing —
  duties, requirements, benefits, the company blurb — runs past 5,000 often enough to be refused
  in ordinary use. Still capped, so one description cannot be megabytes. Changed in the Zod
  schema and by a new migration (`20260913001336_raise_description_cap.sql`), not by editing
  the original, so a local database keeps its data.
- **A closed application's progress line reads "Rejected" or "Withdrawn"**, not "Closed —
  rejected." The status already says it is closed; the extra word said nothing (§4.4).
- **Cover-letter downloads accepted without `nosniff` (§7.3).** Supabase Storage never sends
  the header on an object (checked in its server code), and adding it would mean serving every
  download through a function. `nosniff` stops a browser guessing that a file is HTML or script
  when its declared type is vague. Here the type is never vague: the upload function stores a
  PDF or Word type taken from the bytes, and browsers do not reinterpret those. On top of that,
  the response is an attachment, so it is saved rather than shown; it comes from Storage's
  origin, not the app's, so even a rendered file could not reach the app's session; and the
  app itself never opens the URL — it saves the bytes as `application/octet-stream`. What is
  left is a signed URL someone already holds, opened within 60 seconds, for a document they
  could download anyway. Not yet confirmed hosted: §7.8 check 3 now includes the headers.
- **The add form attaches a cover letter after the application saves (§4.3, §8.2).** §8.2 says
  the application saves without the file rather than losing the record, so the record goes
  first. A failed upload lands on the new application's detail screen rather than the list,
  because that is where Retry lives — the same upload state, carried across the navigation.
- **Cover letter downloads are fetched through the signed URL and saved by the app, not opened
  as a link (§4.4).** Storage's `Content-Disposition` puts the name percent-encoded in its plain
  `filename` parameter, and WebKit reads that one: on iOS, `Café letter.pdf` saved as
  `Caf%C3%A9%20letter.pdf`. Fetching lets the app name the file in every browser, turns an
  expired or failed URL into the §8.2 error state instead of a tab showing a JSON error, and
  keeps the original name out of the URL. The URL still asks Storage for an attachment, in case
  it is ever opened directly.
- **Cover letters on the detail screen: attach, replace, remove, download (§4.4, §8.2, §9.4).**
  Refusal copy follows the profile photo's, because both come from the same upload function. The
  row write is guarded on the file it replaces, so a second tab cannot make a replace delete a
  file it never replaced. The size comes from Storage's object record rather than a new column —
  an object at a path never changes, so there is nothing to keep in sync.
- **The filename label is cleaned before it is stored and again before it is shown (§9.4).**
  §7.3 said "escaped", which React does; escaping does not stop a right-to-left override making
  `invoice`, a right-to-left override, then `fdp.exe`, read as a PDF, so those characters are dropped too.

### 2026-09-11
- **Detail-screen actions separated by weight, and the button contrast results recorded.**
  Add note and Edit application are the filled action and delete is light red under the page’s
  own near-black, because three tinted buttons in a stack read as one control. Measuring them
  found two hover states that failed §10.1 outright — the filled button faded to 3.45:1 under
  white text, the destructive tint put its text at 3.93:1 — and both darken now instead. The
  delete fill’s own 1.6:1 against the card is the exception now recorded in §10.1.
- **§6 step 2 built: applications CRUD.** Add, list, detail, edit, delete, and notes, against
  the schema that already existed. Status changes from the detail selector and from the edit
  form both go through `services/change-status.ts`, so `status_history` has been written from
  the first commit rather than backfilled — it cannot be. Deliberately not here: cover-letter
  attach and replace (step 3), search, filter tabs, saved filters, sort and pagination (steps
  5–6), and Undo on an application delete, which §9.2 says to leave out rather than fake.
  There is no stats surface yet, so nothing displays the hardcoded zero step 2 mentions;
  stats arrive with step 4, computed from the history now being recorded.
- **A status change, and a creation, are each one Postgres transaction (§2, §9.1).**
  `change_application_status` locks the row, reads its current status, updates it, and appends
  the `status_history` row; `create_application` inserts the application, its creation row, and
  the first note. As separate requests from the browser, a dropped connection or a write-limit
  trip between them would leave a status with no history row — which cannot be backfilled — and
  a second tab could record the wrong `from_status`. Both run with the caller's rights, so RLS
  and the rate limit still apply, and `services/change-status.ts` is still the one client path.
- **A fourth local seed user, `dev-d`, for the tests that add and delete applications.** They
  run in parallel with the auth test that asserts `dev-a`'s exact application count.
- **"Longer than a line" fixed at 80 characters or any line break (§9.3).** A rendered line
  depends on screen width, so the note-delete rule needed an answer that does not.
- **The Add form defaults to the user's local today, not UTC's (§4.3, §5.4).** The default was
  computed in UTC, so from late afternoon on the US west coast the form offered tomorrow. The
  prototype used the local day; the stored value is still UTC midnight of the chosen day.
- **§7.8 check 5 corrected: a locked account answers with the lockout, not a fake wrong
  password.** It asked for a locked account to look exactly like a wrong password. That would
  tell a locked-out user typing the right password that it was wrong — for up to an hour under
  an address block — and protect nothing: the lock is keyed on the email's hash, so an unknown
  address locks identically, and "Too many attempts" reveals no more than the attacker already
  knows. What must match is a real address against an unknown one, and, during the lock, the
  correct password against a wrong one; a new e2e test checks both.
- **Uploads go through an `upload` edge function; the buckets accept no direct writes (§7.2,
  §7.3).** §7.3 required a server-side magic-byte check, but the browser wrote to Storage
  directly, and the only server-side guard, `allowed_mime_types`, trusts the declared
  `Content-Type` — any signed-in user could store an HTML page labelled `image/png`. Signed-in
  users lost their insert and update policies on both buckets. The function checks the bytes
  (for DOCX, that the zip holds a Word document; for avatars, the pixel size from the header),
  chooses the `{user_id}/{uuid}` path, and stores with the service role. The 20-an-hour upload
  limit moved with it (§7.1), since a `storage.objects` trigger cannot attribute a
  service-role write. Settled before cover letters (§6 step 3), which use the same function.
- **§6 step 1 built: sign-in, session, profile.** Sign-in goes through the `sign-in` edge
  function only; the client never calls `signInWithPassword`.
- **`security_events` owner trigger no longer erases the service role's `user_id`.** It forced
  `user_id = auth.uid()` on every insert, and the service role's `auth.uid()` is null — so every
  `sign_in_success` the function wrote had lost the one field it exists to record. Clients are
  still forced to their own id; only the service role keeps what it sends.
- **Per-account lockout brought in line with §7.1 (§7.1 now states it precisely).** As written,
  the lock ended whenever the oldest of the five failures aged out of the window (as little as
  a minute), the "exponential" backoff was a constant 250 ms applied only once locked, any Auth
  error — rate limit or outage — was recorded as a wrong password and shown as one, and a failed
  counter read skipped the lockout entirely.
- **Sign-in response floor raised from 400 ms to 1 s (§7.1 timing).** The function's own work
  takes ~500 ms locally, so a 400 ms floor padded nothing and the password-hash check that only
  a real account costs was measurable — the §7.8 timing test caught it under parallel load.
- **The sign-in function answers CORS for an allowlist (`ALLOWED_ORIGINS`), §7.5.** Hosted
  Supabase adds no CORS headers to functions, so browser sign-in would have failed in production;
  locally Kong answers with `*`, which hid it.
- **Per-IP sign-in limit moved from `config.toml` into the sign-in function (§7.1).** Behind
  the function, Auth's per-IP limit saw one address — the function's — for every sign-in: no
  defence against one machine spraying many accounts, and a shared bucket anyone could drain
  to lock every user out. The function now counts failures per address (a peppered hash of
  the gateway's `x-real-ip`, which clients cannot set) and blocks before calling Auth. Blocked
  responses state the wait, and the client shows it (§8.2), because an address block can last
  up to an hour rather than the account lock's 15 minutes.
- **Session tokens in localStorage accepted as a recorded risk (§7.5), with an enforced CSP as
  the release gate.** §7.5 asked for `HttpOnly` cookies, which a static app talking directly to
  Supabase cannot have. The alternative — a server in front of every Supabase call — is a
  second backend for two users and still would not stop injected script acting in the open
  tab. The enforced CSP addresses the cause (script injection) rather than the symptom (token
  theft), so it is the condition; `npm run preview` now serves the build under it locally.
- **Profile photo rules and copy specified (§4.6, §8.2)**, including that a refused photo
  leaves the current one in place, and that sign-out is this device only.
- **Sign-in links hidden until their screens exist (§4.1).** Both would be dead ends today.

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
- **The list downloads every application (§4.2, §5.3; decided 2026-09-14).** The trigger is the
  size of one person's set, not the number of users: each user loads only their own rows, so adding
  users slows no one's list. Nearly all of the download is `description` (up to 15,000 characters),
  which the list never shows — roughly 0.4 KB an application without it, 4 KB with a pasted job ad,
  so about 4 MB at 1,000 applications and 20 MB at the 5,000 soft cap, before compression.
  **Revisit when the list takes more than a second or two to appear on a phone**, likeliest past
  about 1,000 applications with long descriptions. Then, in this order:
  1. Read the list without `description`, and fetch descriptions in a second request only while
     a saved filter has a text match — the only thing on the list that reads them. No migration,
     and matching stays in `domain/filters.ts` alone, so counts and rows cannot disagree.
  2. Only if that is not enough (a user who relies on text filters): one Postgres function that
     returns the page, the total, and every tab count in one call, with an index on the list order
     — a migration. Its SQL matching must pass the same test cases as `domain/filters.ts`, or the
     two copies drift. Not PostgREST filter strings, which need escaping of `%`, `,` and `(`.

  Either way the change is confined to `use-filtered-applications.ts` and the data layer beneath it.
- No alerting on `app_errors` — accepted at two users (§7.7), revisit before real ones.
- The `rate_limits` fixed window allows up to 2x a limit across a boundary. Accepted; if abuse
  ever makes it matter, the table can hold one row per event instead.
# upload

The only way a file reaches Storage (SPEC §7.3). Signed-in users cannot write to either bucket
directly — migration `20260911160000_uploads_through_function.sql` removed their insert and
update policies — so every avatar and cover letter passes the checks here first.

Why a function: the type check reads the file's bytes, and nothing on the database side can. A
Storage policy or trigger sees the object's name, never its contents, and a bucket's
`allowed_mime_types` trusts the `Content-Type` the sender declares.

## Contract

`POST /functions/v1/upload/<kind>`, `kind` = `avatar` | `cover-letter`, with the file as the raw
request body and the user's access token as `Authorization: Bearer …` (supabase-js
`functions.invoke('upload/avatar', { body: file })` sends both). The file's name and
`Content-Type` are ignored.

| response | meaning |
|---|---|
| `201 { path }` | stored at `path` = `{user_id}/{uuid}.{ext}`, chosen here; the client saves it to its row |
| `401 { error }` | no token, or one Auth no longer honours |
| `404 { error }` | unknown kind |
| `413 { error }` | over the kind's size cap |
| `415 { error }` | not an accepted type, by its bytes |
| `422 { error }` | avatar over 4000 × 4000 px |
| `429 { error }` | over 20 uploads in the hour (§7.1) |
| `503 { error }` | the limit counter or Storage unavailable — nothing was stored or counted as stored |

The client maps these statuses to its own copy (`src/data/storage.ts`); the `error` strings are
for curl, not for rendering.

| kind | bucket | types, by bytes | max |
|---|---|---|---|
| `avatar` | `avatars` | PNG, JPEG, WebP | 2 MB, 4000 × 4000 px (read from the header, never decoded) |
| `cover-letter` | `cover-letters` | PDF, DOC, DOCX | 10 MB |

DOCX is a zip, so the zip signature is not enough: its directory must hold `word/document.xml`
and `[Content_Types].xml`, which rules out an `.xlsx`, a `.jar`, or any other zip. DOC is the
OLE2 container, which only legacy Office formats use; an `.xls` would pass as a `.doc`, since
telling them apart means walking the container's own file table. The file is still served as an
attachment with `nosniff`, so a mislabelled Office file opens as a download, never in the page.

The checks are pure functions in `files.ts`, unit-tested in `files.test.ts` (`npm test`). The
app runs the same avatar checks first (`src/domain/avatar.ts`) so a refusal needs no round
trip; those are UX. These are the ones that count.

What this does not do: prove a file harmless. A hostile PDF is still a PDF. Private buckets,
signed URLs generated on click, `Content-Disposition: attachment`, `nosniff`, and no SVG
anywhere are what protect the person who opens it (§7.3).

## Order

1. The token → the user id, via `auth.getUser` (the gateway's `verify_jwt` checks the signature
   first; this also refuses a token whose session was signed out).
2. The body, read to the end, keeping no more than the kind's cap. An oversized body is drained
   and discarded, never left unread: the edge runtime does not complete a response sent over an
   unread body, and the stuck worker blocks the function until its container is recreated.
3. Type, size, dimensions.
4. `consume_rate_limit('upload', 20, '1 hour')`, called **as the user**, so the count is theirs.
   After the checks, so a refused file costs nothing. A failed count refuses the upload.
5. Stored with the service role at the generated path, `Content-Type` from step 3.
6. A `file_upload` security event with the user's id.

## Secrets

`ALLOWED_ORIGINS` — the same allowlist the sign-in function uses (Supabase secrets are
project-wide, so it is already set once the sign-in README's steps are done). Locally it comes
from `supabase/functions/.env.local`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` are injected by the platform; the service role key stays here.

## Tests (§7.8) — `e2e/upload-function.spec.ts`

1. A signed-in user writing to either bucket directly is refused.
2. A disguised SVG, a non-Word zip, an oversized file, and an oversized image are refused with
   415 / 415 / 413 / 422 — and none of them is stored.
3. An accepted file lands at a path in the uploader's own folder with the sniffed type, whatever
   name and type it was sent with.
4. No token → 401. CORS only for allowlisted origins.

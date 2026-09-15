# Job Application Tracker — project brief

**Read `SPEC.md` before any code change.** It defines the data model, screens, and business
rules. §7 (Security requirements) is non-negotiable — treat every item there as a release
blocker, not a suggestion.

**Keep the spec current.** When a change alters *what the product does* — a new screen, a
changed rule, a new field, different error copy — update SPEC.md in the same commit and add a
line to its §14 Changelog saying what changed and why. Changes to *how we build* (a library, a
convention, a rule learned the hard way) go here in CLAUDE.md instead. Visual tweaks go in
neither; the prototype is the reference for those.

Design reference: `Job Tracker Prototype.dc.html` — an interactive prototype of the intended
behavior. Read it for interaction detail and visual intent, not for code structure; it is a
single-file prototype with in-memory state and is not the architecture.

---

## Repo shape

One repo, no workspaces. Everything ships together: one React app, one Supabase project and
its edge functions, one test suite — and workspaces earn their overhead when two deployables share
a library. `src/domain/` imports nothing from the rest of `src/`, so if a second consumer ever
appears it becomes `packages/domain` by moving it. Do not pre-build that.

The generated tooling (`package.json`, Vite, Tailwind, ESLint config) is not committed:
README.md lists the generators to run and the eight scripts that must exist afterwards. Run
them rather than hand-writing config — a hand-written approximation pins stale versions. What
*is* committed is every file that encodes a decision: `supabase/`, `src/domain/`,
`tsconfig.strict.json`, `.env.example`, `e2e/security.spec.ts`.

## Stack

- **React + TypeScript** — function components, hooks. Strict mode on.
- **TanStack Router** — typed routes. Filter, search, sort, and page state live in validated
  **search params**, not component state, so a filtered list is linkable and survives reload.
- **TanStack Query** — all server state. No `useEffect` fetching, no state library for data
  that lives in Postgres.
- **Zod** — the single source of truth for shapes at every boundary: form validation, route
  search params, and parsing anything that arrives from outside the app.
- **shadcn/ui + Tailwind + Radix** — component layer. Components are generated into the repo
  and owned by us; Radix gives keyboard behavior and focus management for free (SPEC §10).
- **react-hook-form** with `zodResolver` — the shadcn `Form` pattern, so field errors come
  from the same Zod schema as everything else.
- **Supabase** — Postgres, Auth, and Storage. Row Level Security on every table.
- **Postgres** — schema managed as versioned migration files in the repo, never ad-hoc edits
  in the Supabase dashboard.
- **Vitest + Testing Library + Playwright** — unit, component, and end-to-end respectively.
- **No external error service.** Errors go to an insert-only `app_errors` Postgres table
  (SPEC §7.7), reported through one `services/report-error.ts` function so the destination can
  change later without touching call sites.

## Running it

```bash
npm install
cp .env.example .env.local        # fill in the Supabase URL + anon key
npx supabase start                # local Postgres, Auth, Storage on Docker
npx supabase db reset             # applies every migration, then seed.sql
npm run dev
```

`supabase start` prints local keys — those go in `.env.local`, which is gitignored.
Never point a dev run at the hosted project; `db reset` drops everything.

Scripts that must exist and keep working: `dev`, `build`, `test`, `test:e2e`, `lint`,
`typecheck`, `db:reset`, `db:types`.

Three of those deviate from the README table, each for a reason. **Do not correct them
back:**

- **`typecheck` is `tsc -b --noEmit`**, not `tsc --noEmit`. The generated root tsconfig is
  solution-style (`"files": []` plus references), so plain `tsc --noEmit` compiles zero
  files and exits 0 — a typecheck that can never fail. `-b` checks `src/`, `e2e/`, and the
  config files.
- **`lint` is ESLint, not oxlint.** Current `npm create vite` scaffolds oxlint; the script
  table mandates `eslint .`. oxlint was removed and ESLint + typescript-eslint installed.
  `eslint.config.js` is the one hand-written config in the repo, deliberately — no
  generator produces it any more.
- **`supabase` is a devDependency.** `db:reset` and `db:types` call a bare `supabase`,
  which only resolves from `node_modules/.bin`.

Four more bootstrap settlements, for the same reason:

- **Tailwind installs before `shadcn init`.** Current shadcn validates Tailwind and the
  path aliases as prerequisites instead of writing them, so README step 2 fails until
  step 6 has been done.
- **`baseUrl` is gone from `tsconfig.strict.json`** — TypeScript 6 errors on it as
  deprecated. `paths` alone resolves relative to the config file, and shadcn still
  finds the aliases.
- **`SIGN_IN_HASH_PEPPER` lives in `supabase/functions/.env.local`** (gitignored), not the
  app's `.env.local`, which `.env.example` forbids it from ever entering (§7.4). Serve
  with `--env-file supabase/functions/.env.local`.
- **`ALLOWED_ORIGINS` lives beside the pepper** in `supabase/functions/.env.local`
  (locally `http://localhost:5173,http://127.0.0.1:5173`; hosted, `supabase secrets set`).
  Local Kong answers CORS with `*` on its own, so a missing allowlist only shows up hosted.
- **`SIGN_IN_IP_MAX_FAILURES=200` in the local function env, never hosted.** Every local
  request reaches the function from one Docker address, so the §7.1 value of 20 would block
  the next e2e run for an hour. Unset (hosted) means 20.
- **`functions serve` replaces the edge container `supabase start` made.** If it dies
  mid-reload on a container-name conflict, `docker rm -f
  supabase_edge_runtime_job-application-tracker` and serve again.
- **Any write under `supabase/functions` recreates that container** — a README included.
  Requests in flight fail, so don't edit there while the e2e suite runs.
- **A function must read a request body to the end before answering, even to refuse it.**
  The edge runtime (1.74) never completes a response sent over an unread body — `cancel()`
  does not help — and the stuck worker stops that function starting again until the container
  is recreated. `upload/index.ts` `readCapped` drains and discards past the cap.
- **`src/lib/utils.ts` stays as shadcn generated it.** It is the `cn` helper every
  generated component imports, not a `utils.ts` junk drawer; moving it breaks
  `shadcn add`.

## Database workflow

Schema changes are files, in this order, every time:

```bash
npx supabase migration new add_status_history      # creates the timestamped .sql file
# write the SQL: table + its RLS policies together, in that one file
npx supabase db reset                              # re-apply from scratch, catches ordering bugs
npm run db:types                                   # regenerate src/data/database.types.ts
```

- **Never edit schema in the dashboard.** A change that is not a migration file does not
  exist on anyone else's machine.
- **Never hand-edit `database.types.ts`.** Regenerate it in the same commit as the migration;
  a stale type file is worse than no type file.
- One migration per logical change, named for what it does. Never edit a migration that has
  been applied anywhere but locally — write a new one.
- A migration that creates a table and does not create its RLS policies is incomplete
  (SPEC §7.2).

## Testing

Three layers, each with a job:

- **Vitest** for `domain/` — pure functions, no mocks needed. `filters.ts`, `location.ts`,
  `stats.ts`, and every Zod schema get real coverage, including the edge cases SPEC §5.2
  spells out.
  **Run the date tests in two timezones**: `TZ=UTC npm test` and
  `TZ=America/Los_Angeles npm test`. The §5.4 bug — UTC midnight rendered in local time showing
  the previous day — is invisible at or east of Greenwich, so a green suite on a UTC CI runner
  proves nothing. Set both in CI.
  **On Windows, `TZ=America/Los_Angeles` is silently ignored** — Node falls back to the
  system zone and the suite goes green having tested nothing new. Only POSIX-style names
  work there: use `TZ=PST8PDT npm test`, which genuinely resolves to America/Los_Angeles.
  (`TZ=UTC` works everywhere.) Verify with
  `node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"` if in doubt.
- **Testing Library** for components with logic worth asserting: the form's validation
  messages, the three states of a list (§8), keyboard operation of the filter builder.
  Query by role and label, never by test id — a test that cannot find the button by its
  accessible name is telling you the button is inaccessible.
- **Playwright** for the flows that cross layers: sign-in, add → appears in list → edit →
  delete, and the two security checks SPEC §7.8 requires as tests rather than manual steps:
  1. user B cannot read or write user A's application by id;
  2. deleting an application removes its notes, history rows, and Storage object.

  Tests that add or delete applications sign in as `dev-d`: `auth.spec.ts` asserts `dev-a`'s
  exact application count, and the suites run in parallel.

  **Stats cover a user's whole set, so an exact number needs a set nobody else is changing.**
  `stats.spec.ts` reads `dev-a`'s seed read-only and asserts its numbers exactly — a change to
  `dev-a`'s seeded applications or history in `seed.sql` changes them (and `auth.spec.ts`'s
  count). Its status-change test runs as `dev-d`, whose set other suites change mid-run, so it
  narrows the `applications` and `status_history` responses the page reads to its own row with
  `page.route` + `route.fetch()`: the writes, reads, and counting stay real.

  **`dev-d`'s writes are budgeted too.** The write limit is 120 a minute per user (§7.1), and
  every insert, update, and delete on the writable tables counts — a status change is two (the
  status and its history row). A full run spends about 116 of `dev-d`'s, mostly inside one
  minute, so a new test that writes as `dev-d` trips the limit at random in whichever suite
  happens to write last. Count what a new test spends (`select window_start, count from
  public.rate_limits where bucket = 'write'` after a run), run it in one browser when the
  engine is not its subject, and prefer `page.route` for failures over real writes. A suite that
  writes a lot gets its own seed user instead: `dev-e` belongs to `bulk-delete.spec.ts` alone.
  `dev-g` belongs to `pagination.spec.ts`: 23 applications, read-only, with a date tie across the
  end of page 1 and one on the 1st of a month — nothing may write as `dev-g`, and the spec takes
  its expected order from the database rather than from a list in the test.
  `dev-f` belongs to the saving-and-deleting half of `filters.spec.ts`, which runs in Chromium
  only and serially, because its tests change one user's saved filters and "Custom N"; the
  reading half asserts `dev-a`'s seeded tabs exactly (`All (7)`, `Live (3)`, …), so a change to
  `dev-a`'s seeded applications or saved filters changes those too. **Never save a filter as
  `dev-a`.**

  **The builder's chips and any/yes/no choices are visually hidden native inputs inside a
  `<label>`.** Playwright's `check()` refuses them (the label intercepts the click); click the
  label, as a user does, and assert with `toBeChecked()` on the input by role.

  **Real uploads are budgeted.** Every stored file counts against its user's 20 an hour (§7.1).
  A full run stores 9 of `dev-d`'s — `cover-letters.spec.ts` three per browser, `security.spec.ts`
  three — so a third run inside the hour trips the limit. Simulate failures at the network
  (`page.route`) rather than spending uploads on them; refused files cost nothing. Locally,
  `delete from public.rate_limits;` resets the count.

  **`getByText('…')` is a case-insensitive substring match.** "Cover letter attached." matches
  "No cover letter attached.", and a filename matches "Uploading *name*…" — either passes before
  the thing it waits for has happened. Use `{ exact: true }` for any text that can appear inside
  other text.

  **WebKit does not focus a button on click**, as Safari on macOS does not. A test asserting where
  focus stays after pressing a button presses it from the keyboard (`focus()` then `Enter`).

  **Run axe once nothing is animating** (`document.getAnimations()`). A toast fading in measures
  about 1.6:1 for its first frames and passes once settled, so a scan that lands mid-fade fails at
  random.

  **A test that is not about signing in starts signed in** — `e2e/session.ts` takes a session
  straight from Auth and puts it in storage. Every sign-in through the form reaches Auth from
  the sign-in function's one address, so they all share a single provider-side bucket
  (§7.1, `config.toml` `sign_in_sign_ups`); a suite that signs in through the form everywhere
  spends that budget on tests that are testing something else, and the later ones are refused
  and fail for reasons of their own. `auth.spec.ts` and `sign-in-function.spec.ts` still use
  the form, because that is their subject.

  `e2e/security.spec.ts` exists already and fails until the features do. Two standing rules for
  it: get it green by fixing policies, **never** by softening an assertion; and its delete test
  currently calls the tables directly — **rewire it to `services/delete-application.ts` the
  moment that file exists**, because the assertion is only worth anything if it exercises the
  path that ships.
- **axe** assertions in the component and e2e layers (SPEC §10.5). A clean axe run is not
  compliance, but a failing one is a bug.

What does not need a test: presentational markup, generated shadcn primitives, styling.
Do not chase a coverage number; cover the rules and the money paths.

## Project structure

```
src/
  main.tsx                    entry: providers only (query client, router, auth, toasts)
  App.tsx                     route tree, nothing else

  routes/                     one file per URL, thin — compose features, no logic.
                              Each route declares a Zod `validateSearch` for its params.
    sign-in.tsx
    applications.tsx          the list (SPEC §4.2)
    application-detail.tsx    (§4.4)
    application-new.tsx       (§4.3)
    application-edit.tsx      (§9.1)
    stats.tsx                 (§4.5)
    profile.tsx               (§4.6)

  domain/                     PURE business rules — no React, no Supabase, no imports from
                              elsewhere in src/. Unit-tested (§5).
    status.ts                 STATUSES, funnel order, terminal states, color tokens
    date.ts                   the ONLY place date_applied converts or formats (§5.4)
    filters.ts                matchesFilter(app, criteria)  (§5.1)
    order.ts                  newest / oldest first, a total order (§5.3)
    pagination.ts             the page window, range label, numbered pages (§4.2)
    location.ts               normalizeLocation()           (§5.2)
    stats.ts                  computeStats(apps, history)   (§4.5) — furthest stage reached
    schemas.ts                Zod schemas + inferred types — the source of truth for
                              Application, Note, SavedFilter and their validation rules
    types.ts                  types not derived from a schema
    *.test.ts

  data/                       Supabase access, one module per table. The ONLY place the
                              Supabase client is imported. Returns domain types, not raw rows.
    client.ts                 configured client (anon key only)
    database.types.ts         GENERATED from schema — never hand-edited
    applications.ts           list / get / create / update / remove
    notes.ts
    saved-filters.ts
    status-history.ts         reads only, for stats (§4.5); rows are written only by the two
                              SQL functions, never from the client
    all-pages.ts              reads a whole set past PostgREST's silent max_rows cut-off —
                              for anything that must cover every row (§5.3), such as stats
    storage.ts                upload (via the upload function) / signed URL / delete
    profile.ts

  services/                   multi-table operations that must not live in a component
    change-status.ts          the ONE status-change path: update + status_history (§9.1)
    delete-application.ts     cascade + Storage cleanup (§9.2)
    delete-account.ts         Storage first, then auth.users + cascade (§9.7). The order is
                              the rule: Storage does not cascade, so a failed file delete has
                              to stop before the account is gone
    export-data.ts            client-side zip of the user's own data (§9.8)
    report-error.ts           the ONE error-reporting path (§7.7)

  queries/                    TanStack Query hooks: keys, fetchers, invalidation
    keys.ts                   single source of query keys
    use-applications.ts
    use-application.ts
    use-notes.ts
    use-saved-filters.ts
    use-stats.ts
    use-mutations.ts          sign-in, sign-out, avatar
    use-application-mutations.ts   add, edit, status, star, delete
    use-note-mutations.ts     add, edit, delete, restore

  features/                   feature-owned UI. May import ui/, domain/, queries/, hooks/ —
                              never another feature's internals.
    auth/                     SignInScreen, SignInForm (guard: routes/authenticated.tsx)
    shell/                    AppShell (header + skip link), RouteError, NotFound
    applications/
      ApplicationsScreen.tsx      the list and its three states (§8.2)
      ApplicationTable.tsx        at 760px and wider
      ApplicationTableHeader.tsx  shared with the loading skeleton; the date header is the sort
      ApplicationPagination.tsx   rows per page, the range, and the pages as router links (§4.2)
      SortToggle.tsx              the sort as its own control below 760px (§11)
      JumpToBottom.tsx            the floating pill; moves focus to the pagination too
      list-return.ts              the list's last URL state, for Back to applications (memory only)
      ApplicationRow.tsx
      ApplicationCards.tsx        below 760px (§11)
      ApplicationCard.tsx
      ApplicationListSkeleton.tsx
      AddApplicationLink.tsx
      NoneMark.tsx                a dash to see, a word to hear
      StatusTag.tsx
      StarToggle.tsx
      use-open-application.ts     row click, without a second tab stop
      AddApplicationScreen.tsx
      EditApplicationScreen.tsx
      ApplicationForm.tsx         shared by add + edit (§9.1)
      DiscardChangesDialog.tsx
      ApplicationDetailScreen.tsx
      StatusSelect.tsx            the one status-change control (§4.4)
      FunnelIndicator.tsx
      NotesSection.tsx
      NoteItem.tsx
      DeleteApplicationDialog.tsx
      BulkDeleteDialog.tsx        several at once from the list, same path per application (§9.2)
      SelectionBar.tsx
      SelectCheckbox.tsx
      use-selection.ts            which rows are ticked; rows on screen only
      delete-summary.ts           what a delete takes with it, and the bulk copy (§9.2)
      panel.ts                    the shared card and section headings
      CoverLetterField.tsx        step 3
    filters/
      SearchBox.tsx               keeps its own text; ignores the URL echoing what it sent
      FilterTabs.tsx              toggle buttons in a labelled group, not ARIA tabs (§4.2)
      SavedFilterTab.tsx          the tab and its × as sibling buttons
      tab-styles.ts               one tab look, shared with the builder's any/yes/no choices
      FilterBuilder.tsx
      LocationCombobox.tsx        type to narrow the places already used; picks only from them (§4.2)
      StatusChips.tsx             native checkboxes drawn as status tags
      TriStateChoice.tsx          native radios drawn as tabs
      use-list-filters.ts         the list's URL state: `filter`, `q`, `sort`, `page`, `pageSize`
      use-filtered-applications.ts  tab counts over the whole set (§5.3), then sorted, filtered,
                                  and cut to the page — the one place that would change if the
                                  database ever pages instead (SPEC §14, 2026-09-14)
    stats/
      StatsScreen.tsx             the three states (§8.2) and the summary
      StatCard.tsx
      BreakdownBar.tsx            decoration; its legend carries the breakdown (§10.1)
      StatsSkeleton.tsx
      layout.ts                   panel and grid classes shared with the skeleton
    profile/
      AvatarUpload.tsx

  components/
    ui/                       shadcn-generated primitives. Ours once generated — edit in place,
                              do not wrap in a second layer of near-identical components.
      button.tsx  input.tsx  select.tsx  textarea.tsx  checkbox.tsx
      dialog.tsx  sonner.tsx  badge.tsx  table.tsx  skeleton.tsx  combobox.tsx  input-group.tsx
                              Add via `npx shadcn@latest add <name>`; commit the generated file.
                              It asks to overwrite shared primitives we have edited (button,
                              input, textarea) and aborts when nothing answers — run it as
                              `yes n | npx shadcn@latest add <name>` so those edits survive.
    EmptyState.tsx            app-level primitives shadcn does not ship (SPEC §8)
    ErrorState.tsx

  hooks/                      generic: useMediaQuery, prefersReducedMotion
  lib/
    utils.ts                  the shadcn `cn` helper — stays exactly as generated
    save-file.ts              hands the browser a blob to save; used by the cover-letter
                              download (§4.4) and the export (§9.8), so it sits above both
                              rather than inside either feature
  styles/globals.css          Tailwind layers + the audited palette (§3) as CSS variables
                              wired into the shadcn theme tokens
  test/                       setup, factories, a11y helpers

supabase/
  migrations/                 versioned SQL: schema and its RLS policies together
  seed.sql
```

### Structure rules

- **Dependency direction is one-way:** `routes → features → {components, queries, domain}` and
  `queries → services → data → domain`. Nothing lower imports something higher.
  `domain/` imports nothing from `src/`.
- **`components/ui/` imports no feature.** Feature-specific behavior wraps a primitive in
  `features/`, it does not leak into the shadcn file.
- **Components never import the Supabase client.** A component takes props or calls a hook
  from `queries/`.
- **Use the shadcn primitive before writing a component.** Check whether one exists and
  generate it; a hand-rolled dropdown or dialog will be less accessible than the Radix one.
  Custom components are for things shadcn genuinely does not cover (the status tag, the star
  toggle, the breakdown bar, the filter builder).
- Style with Tailwind utilities and the theme tokens. The audited palette (SPEC §3, §10.1)
  goes in the theme as variables — no raw hex or one-off colors at call sites.
- **Restyling shadcn defaults does not preserve contrast.** Any token change to primary,
  border, muted-foreground, or destructive gets re-measured against SPEC §10.1 — the shadcn
  defaults are not the audited palette.
- One component per file, named after the file. Split once a file passes ~150 lines or holds
  two components worth naming.
- **No `utils.ts` junk drawer.** A helper lives beside what it serves, or in `domain/` if it
  is a business rule.
- **Co-locate tests** (`filters.test.ts` beside `filters.ts`).
- **A new table means a new `data/` module plus a migration containing its RLS policies** — in
  the same commit.
- The prototype's shape (one file, inline styles, in-memory state) is a reference for behavior
  only. Do not port its structure.

## Conventions

- TypeScript strict; no `any`. Generate types from the Supabase schema rather than hand-writing
  row types, and keep them regenerated after each migration.
- **Validation with Zod, one schema per shape.** Define it once in `domain/schemas.ts`, derive
  the type with `z.infer` — never hand-write a type that a schema already describes. Rules:
  - the Add and Edit forms validate against the **same** schema (SPEC §9.1);
  - validate at the boundary — form submit, route search params, and any file or external
    payload — not scattered through components;
  - field-level messages come from the schema so the copy matches SPEC §8 in both forms;
  - Zod validates *user input*; it does not replace RLS. Never treat a parsed shape as proof
    of authorization.
- Route state via TanStack Router search params with `validateSearch`: `filter`, `q`, `sort`,
  `page`, `pageSize`. Derive the query key from those params so navigation and caching agree.
  Give every search field `.default()` as well as `.catch()` — the router types links from the
  schema's *input*, and without a default every link must spell out every param — and strip
  defaults from the URL with `search: { middlewares: [stripSearchParams(schema.parse({}))] }`.
- Data access lives in a thin typed layer (one module per table). Components do not call the
  Supabase client directly.
- Server state through TanStack Query only. Rules that keep it sane:
  - **every key comes from `queries/keys.ts`** — no inline key arrays at call sites, or
    invalidation silently misses;
  - components call a hook from `queries/`, never `useQuery` with an inline fetcher;
  - mutations declare their invalidations explicitly; after a status change invalidate the
    list, the detail, and stats;
  - optimistic updates (star, status, note add) use `onMutate` + rollback in `onError`,
    matching SPEC §8.3;
  - `staleTime` set deliberately per query — stats and the list can tolerate seconds, an open
    detail screen cannot.
- Every list and mutation handles three states explicitly: loading, empty, error — specified
  per surface in SPEC.md §8. The prototype only shows the happy path; do not ship without the
  other two.
- **WCAG 2.2 AA is a requirement, not a polish pass** (SPEC.md §10). Semantic HTML first,
  keyboard operable, visible focus, labelled inputs. Build it in — retrofitting is worse.
- **Anything clickable shows the pointer cursor**, so a user can tell by hovering that it does
  something. `Button` has `cursor-pointer` in its base style (every variant, `link` included);
  `<a>` and router `Link` get it from the browser. Anything else made clickable — a `<label>`
  wrapping a file input, a card, a table row, a generated shadcn component (`shadcn add` output
  often leaves the default arrow: select triggers, checkboxes, tabs, menu items) — needs
  `cursor-pointer` added by hand. While disabled or pending, show `cursor-not-allowed` or
  `cursor-wait` instead (see `AvatarUpload.tsx`). Check it by hovering, in the same pass as the
  keyboard check.
- Prefer small pure functions for business rules (filter matching, location normalization) and
  unit-test them; they are specified in SPEC.md §5.
- **Errors reach `reportError()` through `queries/errors.ts`.** Every fetcher and mutation
  runs inside `reporting(action, fn, isExpected)`: unexpected failures are reported once and
  rethrown as `ReportedError`; outcomes the user can fix (wrong password, refused file) pass
  through unreported. Components show `errorReference(error)` and never report themselves.
  `ErrorAction` is a closed union — add a member, never a free-form string.
- **The session is a store, not a query.** `data/auth.ts` owns it (supabase-js announces
  changes); `useSession()` subscribes. Route guards read it from router context in
  `beforeLoad`; `main.tsx` re-runs them on every change and clears the query cache on every
  sign-out — but never while the session is still `loading`, because guards that see the
  placeholder context redirect an expired session without saying it expired (Chromium only;
  WebKit happened to win the race). "Expired" means the page load began with a session in
  storage (`AUTH_STORAGE_KEY`, read synchronously at module load) that did not come back;
  auth-js's event order differs by browser and is not used. `useSignedInUser()` still answers
  during the redirect after sign-out, so screens never crash on the way out.
- **Ids validate with `z.guid()`, not `z.string().uuid()`.** Zod 4's `uuid()` enforces the RFC
  variant bits, and the seed's fixed ids (`1111…`, `a000…`) fail it.
- **Timestamps validate with `z.iso.datetime({ offset: true })`.** PostgREST sends
  `2026-09-11T16:43:33.642123+00:00`; the default `datetime()` accepts only `Z` and rejects
  every row.
- **Zod runs `jitless`** (`z.config` at the top of `domain/schemas.ts`). Its JIT probes
  `new Function`, which the enforced CSP reports as a violation on every load. Any new
  dependency that needs `eval` or `new Function` is a CSP problem — check it with
  `npm run build && npm run preview` before adopting it.
- **A library that spawns a worker is the same CSP problem.** The §7.5 policy has no
  `worker-src`, so a worker falls back to `default-src 'self'` and a `blob:` worker is refused.
  `fflate` (the export's zip, `services/export-data.ts`) is imported as `zipSync` **only** —
  its async API builds exactly such a worker. Check a new dependency for both before adopting it.
- **Private-bucket images render as `data:` URLs** downloaded through the authenticated client
  (`data/storage.ts`), not signed URLs: no fetchable link sits in the page, and nothing needs
  revoking. Downloads the user clicks (cover letters) are fetched through a 60-second signed URL
  made on the click (§7.3) and saved from a blob (`lib/save-file.ts`) — never
  handed to the browser as a link: Storage percent-encodes the name in `Content-Disposition`'s
  plain `filename`, which WebKit uses, and storage-js's own `download` option encodes it twice.
  Preview (PDF only) is the one exception: a blank tab opened during the click, `opener` cut,
  then sent to a signed URL without `download` (`features/applications/preview-tab.ts`), so the
  PDF renders inline on Storage's origin. Never a `blob:` URL — that would render it as the app.
- **A link that looks like a button is a router `<Link>` with `buttonVariants`, never rendered
  through `Button`.** Base UI's `Button` with `nativeButton={false}` gives whatever it renders
  `role="button"` and Space-to-activate, so a link loses its link role (and `aria-current` means
  nothing on it). `components/ui/pagination.tsx` was edited for this.
- **Links to the route already on screen take `activeOptions={{ exact: true }}`.** The router
  marks a link `aria-current="page"` when its search is a *partial* match of the current one, and
  a link at every default (page 1, stripped from the URL) partially matches every list URL — the
  Previous link would announce itself as the current page.
- **Navigation within a screen passes `resetScroll: false`.** `scrollRestoration` is on, and the
  router scrolls to the top on every navigation otherwise — away from a control at the bottom of
  the list that just changed the URL.
- **A height passed to a generated primitive has to be able to win.** Generated classes like
  `data-[size=default]:h-8` carry an attribute selector, which outranks a caller's plain `h-11`
  whatever tailwind-merge does — so `max-[760px]:h-11` silently did nothing on every select,
  and phones got 32px instead of §11's 44. `select.tsx` now sizes with plain classes. Measure a
  new control's height at 360px (`boundingBox()`), don't read it off the class list.
- **Focus uses the full-strength `ring` token.** shadcn generates `ring-ring/50`, which
  measures 2.1:1 on white and fails §10.1; `button.tsx` and `input.tsx` were edited to
  `ring-ring`. Re-check any newly generated primitive for `/50` rings.

## Hard rules

- **RLS on every table**, policies for select/insert/update/delete separately. A new table
  without a policy is a bug, not a TODO.
- The `service_role` key never appears in client code, in a client env var, or in git.
- **`seed.sql` never runs against a hosted project.** It creates `dev-a` / `dev-b` / `dev-c` with a
  password and user ids that are public in this repo. Plain `npx supabase db push` does
  not seed — keep it that way: no `--include-seed`, no `db reset --linked`. The repo is
  public, so those credentials are an open door the moment they exist on the internet.
- Never log PII — emails, application contents, note bodies, file names. SPEC §7.7 lists what
  to log instead.
- Field length caps come from SPEC §7.3 — in the Zod schema and as a Postgres constraint.
- All queries scoped by `auth.uid()`; never trust an id sent from the client.
- No raw string-concatenated SQL. Parameterized queries or the client library only.
- Cover letters go in a private Storage bucket, served via 60-second signed URLs generated on
  click. Verify file type by magic bytes, never by extension.
- **Files enter Storage only through `supabase/functions/upload`** (`data/storage.ts`
  `uploadFile`). Signed-in users have no insert or update policy on either bucket — never add
  one back, or the server-side type check becomes optional. The function chooses the path.
- Never `dangerouslySetInnerHTML` on user content. Descriptions and notes are free text.
- Status changes always go through one code path that writes `status_history` — detail screen
  and edit form both. That path is `services/change-status.ts` → the `change_application_status`
  Postgres function; the creation row comes from `create_application`. Never write `status` in
  a plain update, and never insert into `status_history` from the client.
- Deleting an application deletes its notes, history, and Storage objects. No orphaned files.
- **Deleting an account deletes its Storage objects first, then the `auth.users` row** (§9.7),
  through `supabase/functions/delete-account`. The function takes no id — the token says whose
  account goes — and writes the `account_deletion` `security_events` row itself, with the
  service role, after the delete succeeds. `security_events.user_id` has no foreign key for
  that reason (migration `20260915192815`); `app_errors.user_id` still nulls on delete.
- **Deletion tests use a throwaway user, never a seed one** (`e2e/throwaway-user.ts`): the test
  destroys the account it runs as, so `dev-a` … `dev-g` cannot serve, and a seeded eighth user
  would only work until the first run consumed it. The helper reads the local service-role key
  from `supabase status`, so it cannot be aimed at a hosted project.
- Debug mode and verbose errors off in production builds.
- **Every error is reported through `reportError()`** — never a direct insert or SDK call from
  a component. Stack traces yes; form values, note bodies, and emails never.
- `app_errors` / `security_events` are client-written, so: `user_id` defaults to `auth.uid()`
  and is never sent from the client; insert-only policy with no select policy; message and
  stack capped; raw Postgres error strings mapped to codes before reporting (they echo the
  offending value); route logged without its query string.
- **`date_applied` is written as `T00:00:00Z` and formatted in UTC**, everywhere, no
  exceptions (SPEC §5.4). `new Date(localValue).toISOString()` is the wrong call — it shifts
  the date by the browser's offset and a database constraint will reject it. Local formatting
  is equally wrong in the other direction: it renders the previous day west of Greenwich.
  Every other timestamp is a real moment and formats in the viewer's zone.
- **Migrations are already written for the whole schema** (`supabase/migrations/`). They have
  been applied nowhere but locally, so fixing one in place is still correct; once anything is
  hosted, write a new one. The three that repay reading before you touch them:
  `20260910090400_status_history.sql` (append-only via the *absence* of update and delete
  policies), `20260911165950_status_change_functions.sql` (the only writers of that table, one
  transaction each, invoker rights), and `20260910090700_log_tables.sql` (`auth.uid()`
  defaults, insert-only, clamped).
- Browser support is SPEC §12. iOS Safari 17+ is a first-class target, not an afterthought —
  every browser on iOS is WebKit.
- **Security headers live in `vercel.json`**, the one place (SPEC §7.5). Hosting is Vercel
  Hobby + Supabase Free; README.md's Deploy section has the steps and the reason GitHub Pages
  was rejected. Never add a payment card to either service — that is what guarantees the
  project cannot generate a bill.

## Definition of done

SPEC §7.9 is the checklist, and it is the gate on every feature. Two things about using it:

- Check it at the end of a **feature**, not each commit. Nineteen items per commit is theatre.
- Waiving an item is fine if the pull request says which and why. An item waived repeatedly is
  either wrong or pointing at real work — amend the list rather than routing around it.

The four that get skipped most and cost most: triggering the error path on purpose, the
keyboard-only pass, iOS Safari (not a narrow desktop window), and updating SPEC.md in the
same commit.

## Rate limits

Every limit in SPEC §7.1 has one home; do not add a second enforcement point for the same
limit, and do not add a new limit without deciding where it lives:

- `supabase/config.toml` — provider-side, per-IP: sign-up, token refresh, verifications,
  email sends. Version-controlled; **never change these in the dashboard**, the same rule as
  migrations. Its sign-in limit is only a backstop: every sign-in reaches Auth from the
  sign-in function's address, so there it is one bucket shared by everyone.
- Postgres triggers calling `public.consume_rate_limit(bucket, limit, window)` — anything the
  database can see: writes, error reports.
- `supabase/functions/sign-in` — the per-account lockout **and** the per-IP sign-in limit
  (the only code that sees the caller's address). The client calls this function instead of
  `signInWithPassword`. Its limit decisions are pure functions in `limits.ts`, unit-tested;
  keep Deno APIs in `index.ts`.
- `supabase/functions/upload` — the 20-an-hour upload limit, via `consume_rate_limit` called
  **as the user**. It is Storage's only writer and stores with the service role, whose
  `auth.uid()` is null, so a trigger on `storage.objects` would count nothing.

- `supabase/functions/delete-account` — no limit of its own; it is the only place that can
  remove an `auth.users` row (SPEC §9.7). Deletion is not rate-limited: a user deleting their
  own account once is the end of the story, and a second call has no account to act on.

The three functions are the only places the service role key exists.

`public.rate_limits` has RLS on and no policies at all. That is not an oversight; the definer
functions and the service role are the only intended readers.

## Build order

Follow SPEC.md §6. Ship auth → CRUD → persistence before touching stats, filters, or
pagination. Write `status_history` rows from the first status-change feature — it cannot be
backfilled.

## When unsure

Ask rather than assume, especially about: status semantics, what counts as "heard back",
location normalization edge cases, and anything that changes the data model. Wrong assumptions
here are expensive to unwind.

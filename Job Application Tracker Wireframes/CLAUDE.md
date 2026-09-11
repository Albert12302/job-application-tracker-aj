# Job Application Tracker — project brief

**Read `SPEC.md` before any code change.** It defines the data model, screens, and business
rules. §7 (Security requirements) is non-negotiable — treat every item there as a release
blocker, not a suggestion.

**Keep the spec current.** When a change alters *what the product does* — a new screen, a
changed rule, a new field, different error copy — update SPEC.md in the same commit and add a
line to its §13 Changelog saying what changed and why. Changes to *how we build* (a library, a
convention, a rule learned the hard way) go here in CLAUDE.md instead. Visual tweaks go in
neither; the prototype is the reference for those.

Design reference: `Job Tracker Prototype.dc.html` — an interactive prototype of the intended
behavior. Read it for interaction detail and visual intent, not for code structure; it is a
single-file prototype with in-memory state and is not the architecture.

---

## Repo shape

One repo, no workspaces. Everything ships together: one React app, one Supabase project, one
edge function, one test suite — and workspaces earn their overhead when two deployables share
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
- **Testing Library** for components with logic worth asserting: the form's validation
  messages, the three states of a list (§8), keyboard operation of the filter builder.
  Query by role and label, never by test id — a test that cannot find the button by its
  accessible name is telling you the button is inaccessible.
- **Playwright** for the flows that cross layers: sign-in, add → appears in list → edit →
  delete, and the two security checks SPEC §7.8 requires as tests rather than manual steps:
  1. user B cannot read or write user A's application by id;
  2. deleting an application removes its notes, history rows, and Storage object.

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
    location.ts               normalizeLocation()           (§5.2)
    stats.ts                  computeStats(apps)            (§4.5)
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
    status-history.ts         append-only
    storage.ts                cover-letter upload / signed URL / delete
    profile.ts

  services/                   multi-table operations that must not live in a component
    change-status.ts          the ONE status-change path: update + status_history (§9.1)
    delete-application.ts     cascade + Storage cleanup (§9.2)
    delete-account.ts         Storage first, then auth.users + cascade (§9.7)
    export-data.ts            client-side zip of the user's own data (§9.8)
    report-error.ts           the ONE error-reporting path (§7.7)

  queries/                    TanStack Query hooks: keys, fetchers, invalidation
    keys.ts                   single source of query keys
    use-applications.ts
    use-application.ts
    use-notes.ts
    use-saved-filters.ts
    use-stats.ts
    use-mutations.ts

  features/                   feature-owned UI. May import ui/, domain/, queries/, hooks/ —
                              never another feature's internals.
    auth/                     SignInForm, useAuth, RequireAuth
    applications/
      ApplicationTable.tsx
      ApplicationRow.tsx
      StatusTag.tsx
      StarToggle.tsx
      ApplicationForm.tsx     shared by new + edit
      DeleteApplicationDialog.tsx
      NotesList.tsx
      NoteItem.tsx
      CoverLetterField.tsx
    filters/
      FilterTabs.tsx
      FilterBuilder.tsx
      SavedFilterTab.tsx
      LocationCombobox.tsx
    stats/
      StatCard.tsx
      BreakdownBar.tsx
    profile/
      AvatarUpload.tsx

  components/
    ui/                       shadcn-generated primitives. Ours once generated — edit in place,
                              do not wrap in a second layer of near-identical components.
      button.tsx  input.tsx  select.tsx  textarea.tsx  checkbox.tsx
      dialog.tsx  sonner.tsx  badge.tsx  table.tsx  tabs.tsx  skeleton.tsx
                              Add via `npx shadcn@latest add <name>`; commit the generated file.
    EmptyState.tsx            app-level primitives shadcn does not ship (SPEC §8)
    ErrorState.tsx
    Pagination.tsx            wraps shadcn pagination with our page-size + range label
    LiveRegion.tsx

  hooks/                      generic: useDebounce, useMediaQuery, usePagination
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
- Prefer small pure functions for business rules (filter matching, location normalization) and
  unit-test them; they are specified in SPEC.md §5.

## Hard rules

- **RLS on every table**, policies for select/insert/update/delete separately. A new table
  without a policy is a bug, not a TODO.
- The `service_role` key never appears in client code, in a client env var, or in git.
- Never log PII — emails, application contents, note bodies, file names. SPEC §7.7 lists what
  to log instead.
- Field length caps come from SPEC §7.3 — in the Zod schema and as a Postgres constraint.
- All queries scoped by `auth.uid()`; never trust an id sent from the client.
- No raw string-concatenated SQL. Parameterized queries or the client library only.
- Cover letters go in a private Storage bucket, served via 60-second signed URLs generated on
  click. Verify file type by magic bytes, never by extension.
- Never `dangerouslySetInnerHTML` on user content. Descriptions and notes are free text.
- Status changes always go through one code path that writes `status_history` — detail screen
  and edit form both.
- Deleting an application deletes its notes, history, and Storage objects. No orphaned files.
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
  hosted, write a new one. The two that repay reading before you touch them:
  `20260910090400_status_history.sql` (append-only via the *absence* of update and delete
  policies) and `20260910090700_log_tables.sql` (`auth.uid()` defaults, insert-only, clamped).
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

- `supabase/config.toml` — provider-side, per-IP: sign-in/sign-up, token refresh,
  verifications, email sends. Version-controlled; **never change these in the dashboard**, the
  same rule as migrations.
- Postgres triggers calling `public.consume_rate_limit(bucket, limit, window)` — anything the
  database can see: writes, uploads (trigger on `storage.objects`), error reports.
- `supabase/functions/sign-in` — the per-account lockout, and the only place the service role
  key exists. The client calls this function instead of `signInWithPassword`.

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

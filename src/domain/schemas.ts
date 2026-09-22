import { z } from 'zod';
import { PAGE_SIZES } from './pagination';
import { STATUSES } from './status';

// No JIT. Zod 4 probes `new Function` to compile faster validators, and the
// enforced CSP (SPEC §7.5, script-src 'self') reports that probe as a
// violation on every page load even though Zod catches it. The interpreted
// path is plenty for forms this size. Set here, not in main.tsx: this module is
// where every schema comes from, so it runs before anything can parse — some
// routes parse at import time.
z.config({ jitless: true });

/**
 * One schema per shape, used by the form, the route params, and anything parsed
 * from outside the app (CLAUDE.md). Messages are the copy SPEC §8 specifies —
 * they are user-facing strings, so field errors read identically in the Add and
 * Edit forms, which share this schema (§9.1).
 *
 * Caps match the Postgres constraints in supabase/migrations. Both exist: Zod is
 * UX, the constraint is enforcement (§7.3).
 */

const CAPS = { shortText: 120, description: 15000, noteBody: 2000, filterName: 60 } as const;

export const statusSchema = z.enum(STATUSES);

/** Ids: guid(), not uuid() — uuid() enforces the RFC variant bits, and seed ids such as 1111… fail it. */
const id = z.guid();

/** A timestamptz as PostgREST sends it: an offset (`+00:00`), not always `Z`. */
const timestamp = z.iso.datetime({ offset: true });

/** An application id from outside the app — a route param (§8.2 "Application not found"). */
export const applicationIdSchema = id;

const dateInput = z
  .string()
  .min(1, 'Enter the date you applied.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD.')
  .refine((v) => {
    const [y, m, d] = v.split('-').map(Number);
    const parsed = new Date(Date.UTC(y!, m! - 1, d!));
    return parsed.getUTCMonth() === m! - 1 && parsed.getUTCDate() === d!;
  }, 'That date does not exist.');

/** What the Add and Edit forms validate. `date` is the raw input value;
 *  toUtcMidnight() converts it on submit (§5.4). `note` is the Add form's
 *  first note (§4.3); Edit does not render it. */
export const applicationFormSchema = z.object({
  date: dateInput,
  company: z
    .string()
    .trim()
    .min(1, 'Company and position are required.')
    .max(CAPS.shortText, 'Keep this under 120 characters.'),
  position: z
    .string()
    .trim()
    .min(1, 'Company and position are required.')
    .max(CAPS.shortText, 'Keep this under 120 characters.'),
  location: z.string().trim().max(CAPS.shortText, 'Keep this under 120 characters.').optional(),
  description: z
    .string()
    .trim()
    .max(CAPS.description, 'Descriptions are limited to 15,000 characters.')
    .optional(),
  status: statusSchema,
  referral: z.boolean(),
  note: z.string().trim().max(CAPS.noteBody, 'Notes are limited to 2,000 characters.').optional(),
});

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;

/** A row as the app uses it. date_applied is always UTC midnight (§5.4). */
export const applicationSchema = z.object({
  id,
  user_id: id,
  date_applied: timestamp,
  company: z.string(),
  position: z.string(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  status: statusSchema,
  referral: z.boolean(),
  starred: z.boolean(),
  cover_letter_path: z.string().nullable(),
  cover_letter_name: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export type Application = z.infer<typeof applicationSchema>;

/** An application as stats read it (§4.5): where it stands, and whether it came through a referral. */
export const statsApplicationSchema = applicationSchema.pick({ id: true, status: true, referral: true });

export type StatsApplication = z.infer<typeof statsApplicationSchema>;

/** A status_history row as stats read it (§2). from_status is not needed to replay. */
export const statusChangeSchema = z.object({
  application_id: id,
  to_status: statusSchema,
  changed_at: timestamp,
});

export type StatusChange = z.infer<typeof statusChangeSchema>;

export const noteFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(CAPS.noteBody, 'Notes are limited to 2,000 characters.'),
});

export const noteSchema = z.object({
  id,
  application_id: id,
  body: z.string(),
  created_at: timestamp,
  updated_at: timestamp,
});

export type Note = z.infer<typeof noteSchema>;

export const triStateSchema = z.enum(['any', 'yes', 'no']);

export type TriState = z.infer<typeof triStateSchema>;

/**
 * The filter builder (§4.2, §5.1). A blank name is allowed: it becomes
 * "Custom N" on save (domain/filters.ts). `location` null is "Any location".
 * At least one status is ticked; all six is stored as the row's "all" (`{}`).
 */
export const savedFilterFormSchema = z.object({
  name: z.string().trim().max(CAPS.filterName, 'Keep the name under 60 characters.'),
  statuses: z.array(statusSchema).min(1, 'Choose at least one status.').max(STATUSES.length),
  referral: triStateSchema,
  starred: triStateSchema,
  location: z.string().trim().min(1).max(CAPS.shortText).nullable(),
  text: z.string().trim().max(CAPS.shortText, 'Keep the text under 120 characters.'),
});

export type SavedFilterFormValues = z.infer<typeof savedFilterFormSchema>;

/** A saved_filters row (§2). An empty text match is stored as null. */
export const savedFilterSchema = z.object({
  id,
  user_id: id,
  name: z.string(),
  statuses: z.array(statusSchema),
  referral: triStateSchema,
  starred: triStateSchema,
  location: z.string().nullable(),
  text: z.string().nullable(),
  created_at: timestamp,
});

export type SavedFilter = z.infer<typeof savedFilterSchema>;

/** Sign-in. Deliberately lax on the password: the server decides, and a
 *  client-side "too short" message on sign-in leaks the policy for free. */
export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter an email and password.').max(254),
  password: z.string().min(1, 'Enter an email and password.').max(128),
});

export type SignInValues = z.infer<typeof signInSchema>;

/** /sign-in URL state. `redirect` is untrusted — domain/redirect.ts decides
 *  whether it is followed. Both fall back rather than fail (§8). */
export const signInSearchSchema = z.object({
  redirect: z.string().max(2000).optional().catch(undefined),
  expired: z.boolean().optional().catch(undefined),
  /** Arrived here because the account was just deleted (§9.7). */
  deleted: z.boolean().optional().catch(undefined),
});

/** The sign-in edge function's 200 body. Only the two tokens setSession needs
 *  are checked; the rest of the session object is Auth's business. */
export const signInResponseSchema = z.object({
  session: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
  }),
});

/** The sign-in function's 429 body. Only the wait is read; the copy is the client's own. */
export const signInLockedBodySchema = z.object({
  retryAfterMinutes: z.number().int().min(1).max(24 * 60).optional(),
});

/** A profiles row (§2 User, §4.6). guid(), not uuid(): uuid() enforces the RFC
 *  variant bits, and ids such as the seed's 1111… fail it. */
export const profileSchema = z.object({
  id: z.guid(),
  name: z.string().max(120).nullable(),
  avatar_path: z.string().max(512).nullable(),
});

export type Profile = z.infer<typeof profileSchema>;

/**
 * What the profile's name field submits (§4.6). Capped where the column is
 * (`profiles_name_len`, 120).
 *
 * Empty is valid and is not a way to fail: it clears the name, and
 * `displayName()` falls back to the one derived from the email — so the field
 * is also the way back out of a name you no longer want. `data/profile.ts`
 * `setName` stores that as null rather than an empty string, because null is
 * what the column means by "no name chosen" and what a new account starts as.
 */
export const profileNameSchema = z.object({
  name: z.string().trim().max(CAPS.shortText, 'Keep this under 120 characters.'),
});

export type ProfileNameValues = z.infer<typeof profileNameSchema>;

/** The upload function's 201 body: the path it chose, `{user_id}/{uuid}.ext` (§7.3). */
export const uploadResponseSchema = z.object({
  path: z.string().min(1).max(512),
});

/**
 * A cover letter as an application row holds it (§2): the stored path and the
 * original name, set together or not at all. The name is a display label
 * (domain/cover-letter.ts `coverLetterLabel`), capped as the column is.
 */
export const coverLetterSchema = z.object({
  path: z.string().min(1).max(512),
  name: z.string().min(1).max(255),
});

export type CoverLetter = z.infer<typeof coverLetterSchema>;

/** Storage's object info, as far as the app reads it: the size in bytes. */
export const storageObjectInfoSchema = z.object({
  size: z.number().int().nonnegative(),
});

/** Sign-up (§4.1a). Validation order matters: email, then length, then match. */
export const signUpSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address.').max(254),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters.')
      .max(128, 'Passwords are limited to 128 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Those passwords don't match.",
    path: ['confirm'],
  });

/** The dashboard's URL state (§4.2). Every field has a fallback, so a malformed
 *  link degrades to the default view instead of a blank screen (§8).
 *  `.default()` as well as `.catch()`: the router reads the schema's input
 *  type, and only a default makes a field optional there — without it every
 *  link to /applications would have to spell out all five params. */
export const applicationsSearchSchema = z.object({
  /** `all`, a status name, or a saved filter's id — domain/filters.ts `resolveFilter` reads it. */
  filter: z.string().max(64).default('all').catch('all'),
  /** The search box (§5.1), capped as the field it searches is. */
  q: z.string().max(CAPS.shortText).default('').catch(''),
  /** Newest or oldest first by date applied (§4.2, §5.3). */
  sort: z.enum(['date-desc', 'date-asc']).default('date-desc').catch('date-desc'),
  /** A page past the end is valid here; the list shows its last page and corrects the URL. */
  page: z.coerce.number().int().min(1).default(1).catch(1),
  /** Rows per page: 10, 25, or 50, starting at 10 as the prototype does. */
  pageSize: z.coerce.number().int().pipe(z.literal(PAGE_SIZES)).default(10).catch(10),
});

export type ApplicationsSearch = z.infer<typeof applicationsSearchSchema>;

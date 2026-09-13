import { z } from 'zod';
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

export type NoteFormValues = z.infer<typeof noteFormSchema>;

export const noteSchema = z.object({
  id,
  application_id: id,
  body: z.string(),
  created_at: timestamp,
  updated_at: timestamp,
});

export type Note = z.infer<typeof noteSchema>;

const triState = z.enum(['any', 'yes', 'no']);

export const savedFilterFormSchema = z.object({
  name: z.string().trim().max(CAPS.filterName, 'Keep the name under 60 characters.'),
  statuses: z.array(statusSchema).max(6),
  referral: triState,
  starred: triState,
  location: z.string().trim().max(CAPS.shortText).nullable(),
  text: z.string().trim().max(CAPS.shortText),
});

export type SavedFilterFormValues = z.infer<typeof savedFilterFormSchema>;

export const savedFilterSchema = savedFilterFormSchema.extend({
  id,
  user_id: id,
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
  filter: z.string().default('all').catch('all'),
  q: z.string().default('').catch(''),
  sort: z.enum(['date-desc', 'date-asc']).default('date-desc').catch('date-desc'),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z
    .coerce
    .number()
    .int()
    .pipe(z.union([z.literal(10), z.literal(25), z.literal(50)]))
    .default(25)
    .catch(25),
});

export type ApplicationsSearch = z.infer<typeof applicationsSearchSchema>;

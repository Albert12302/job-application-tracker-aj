import { toDateInputValue, toUtcMidnight } from './date';
import { normalizeLocation } from './location';
import type { Application, ApplicationFormValues } from './schemas';

/**
 * The fields a user edits (SPEC §2) — what Add and Edit write. Everything else
 * on the row is the database's: the id, the owner (auth.uid(), §7.2), the
 * timestamps, and the star, which toggles on its own.
 */
export type ApplicationInput = Pick<
  Application,
  'date_applied' | 'company' | 'position' | 'location' | 'description' | 'status' | 'referral'
>;

/**
 * Parsed form values → the row to write. The date becomes UTC midnight (§5.4)
 * and the location is normalized against the user's other locations (§5.2).
 * `otherLocations` leaves out the application being edited, so its own old
 * spelling cannot stop the user correcting it.
 */
export function toApplicationInput(
  values: ApplicationFormValues,
  otherLocations: readonly (string | null)[],
): ApplicationInput {
  return {
    date_applied: toUtcMidnight(values.date),
    company: values.company,
    position: values.position,
    location: normalizeLocation(values.location, otherLocations),
    description: values.description || null,
    status: values.status,
    referral: values.referral,
  };
}

/** A blank Add form (§4.3): dated `today`, status Applied, no referral. */
export function emptyFormValues(today: string): ApplicationFormValues {
  return {
    date: today,
    company: '',
    position: '',
    location: '',
    description: '',
    status: 'Applied',
    referral: false,
    note: '',
  };
}

/** A saved application → the Edit form, pre-filled (§9.1). */
export function toFormValues(application: Application): ApplicationFormValues {
  return {
    date: toDateInputValue(application.date_applied),
    company: application.company,
    position: application.position,
    location: application.location ?? '',
    description: application.description ?? '',
    status: application.status,
    referral: application.referral,
    note: '',
  };
}

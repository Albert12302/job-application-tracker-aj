import { expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Rows a spec makes for itself, through the same function the app calls.
 *
 * A seed user's set is shared: an earlier run, or another suite writing as the
 * same user at the same moment, decides what "the first row" is. So a test
 * that needs a row makes one, names it after this run, and deletes it after.
 */

/** A name no other run or browser project can have made. */
export function unique(prefix: string, project: string): string {
  return `${prefix} ${project} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Today at midnight UTC, which the column's check constraint requires (§5.4). */
export function todayUtcMidnight(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00+00:00`;
}

/**
 * Create one application and remember its id in `made`, so the spec's cleanup
 * deletes it. Returns the new id.
 */
export async function makeApplication(
  client: SupabaseClient,
  made: string[],
  company: string,
  options: { firstNote?: string; status?: string } = {},
): Promise<string> {
  const { data, error } = await client.rpc('create_application', {
    p_date_applied: todayUtcMidnight(),
    p_company: company,
    p_position: 'Frontend Engineer',
    p_status: options.status ?? 'Applied',
    p_referral: false,
    ...(options.firstNote ? { p_first_note: options.firstNote } : {}),
  });
  expect(error).toBeNull();
  const id = (data as { id: string }).id;
  made.push(id);
  return id;
}

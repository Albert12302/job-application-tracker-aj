import { supabase } from './client';

/**
 * security_events, insert-only (SPEC §7.7). The client writes only the events
 * it is the sole witness to; sign-in success and failure are written by the
 * sign-in edge function, uploads and upload-limit trips by the upload function.
 * No user_id is sent — the column defaults to auth.uid() and a trigger
 * overwrites anything supplied.
 */
export type ClientSecurityEvent = 'sign_out' | 'file_delete' | 'rate_limit_trip';

export async function logSecurityEvent(
  eventType: ClientSecurityEvent,
  outcome: 'success' | 'failure' | 'denied',
): Promise<void> {
  const { error } = await supabase.from('security_events').insert({ event_type: eventType, outcome });
  if (error) throw error;
}

import { supabase } from './client';

/**
 * security_events, insert-only (SPEC §7.7). The client writes only the events
 * it is the sole witness to; sign-in success and failure are written by the
 * sign-in edge function, uploads and upload-limit trips by the upload function.
 * No user_id is sent — the column defaults to auth.uid() and a trigger
 * overwrites anything supplied.
 *
 * `password_reset_request` is not here and cannot be: the requester has no
 * session, so the insert policy refuses them and there is no auth.uid() to
 * attribute the row to. It needs a service-role writer — see SPEC §7.1.
 */
export type ClientSecurityEvent = 'sign_out' | 'file_delete' | 'rate_limit_trip' | 'password_reset_complete';

/**
 * `as` names the client that writes the row, which is the app's own unless the
 * caller holds a session the app deliberately does not (§4.1d's recovery link).
 * Still one writer of this table — told whose token to use, not duplicated.
 */
export async function logSecurityEvent(
  eventType: ClientSecurityEvent,
  outcome: 'success' | 'failure' | 'denied',
  as: typeof supabase = supabase,
): Promise<void> {
  const { error } = await as.from('security_events').insert({ event_type: eventType, outcome });
  if (error) throw error;
}

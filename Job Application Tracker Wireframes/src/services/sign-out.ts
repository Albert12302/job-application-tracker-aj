import { signOut as endSession } from '@/data/auth';
import { logSecurityEvent } from '@/data/security-events';
import { reportError } from './report-error';

/**
 * Sign out of this device (SPEC §9.6). The security event is written first:
 * once the session is gone there is no user to attribute it to, and the insert
 * policy is for authenticated users only.
 */
export async function signOut(): Promise<void> {
  await logSecurityEvent('sign_out', 'success').catch((error: unknown) => {
    reportError(error, { action: 'sign_out' });
  });
  await endSession();
}

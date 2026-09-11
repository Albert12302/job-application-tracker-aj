/**
 * Every query key in the app (CLAUDE.md). Keyed by user id, so one user's
 * cache can never answer for another's.
 *
 * The count sits under ['applications', userId] on purpose: step 2's list
 * mutations invalidate that prefix and the profile's count follows for free.
 */
export const keys = {
  profile: (userId: string) => ['profile', userId] as const,
  avatar: (path: string) => ['avatar', path] as const,
  applications: (userId: string) => ['applications', userId] as const,
  applicationCount: (userId: string) => ['applications', userId, 'count'] as const,
};

/**
 * Every query key in the app (CLAUDE.md). Keyed by user id, so one user's
 * cache can never answer for another's.
 *
 * Everything about applications sits under ['applications', userId]: the list,
 * the profile's count, each detail, and each notes list. A mutation that
 * changes which applications exist invalidates that prefix and all of them
 * follow; one that changes a single application targets its own keys.
 */
export const keys = {
  profile: (userId: string) => ['profile', userId] as const,
  avatar: (path: string) => ['avatar', path] as const,
  applications: (userId: string) => ['applications', userId] as const,
  applicationList: (userId: string) => ['applications', userId, 'list'] as const,
  applicationCount: (userId: string) => ['applications', userId, 'count'] as const,
  application: (userId: string, id: string) => ['applications', userId, 'detail', id] as const,
  notes: (userId: string, applicationId: string) => ['applications', userId, 'notes', applicationId] as const,
};

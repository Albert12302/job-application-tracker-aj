import { useEffect } from 'react';
import { applicationsSearchSchema, type ApplicationsSearch } from '@/domain/schemas';
import { useSignedInUser } from '@/queries/use-session';

/**
 * Where "Back to applications" goes (SPEC §4.2): the list as it was last seen in
 * this tab — filter, search, order, page, and page size — so opening row 23 and
 * coming back lands on page 3, not page 1.
 *
 * Kept in memory only. It holds the search text, which is user content, so it
 * is not written to storage; a reload starts the list fresh. It is keyed to the
 * user, so after a sign-out and a different sign-in the next person gets the
 * default list, never the last person's search.
 */
let remembered: { userId: string; search: ApplicationsSearch } | null = null;

/** The list screen records its URL state as it changes. */
export function useRememberListSearch(search: ApplicationsSearch) {
  const user = useSignedInUser();
  useEffect(() => {
    remembered = { userId: user.id, search };
  }, [user.id, search]);
}

/** The list's URL state to return to, or the default list. */
export function useListReturn(): ApplicationsSearch {
  const user = useSignedInUser();
  return remembered?.userId === user.id ? remembered.search : applicationsSearchSchema.parse({});
}

/** For tests: forget the list. */
export function forgetListSearch() {
  remembered = null;
}

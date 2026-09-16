import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationsSearchSchema } from '@/domain/schemas';
import { forgetListSearch, useListReturn, useRememberListSearch } from './list-return';

let userId = '11111111-1111-1111-1111-111111111111';

vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => ({ id: userId, email: 'someone@example.test' }),
}));

const LEFT = applicationsSearchSchema.parse({ filter: 'Interview', q: 'acme', sort: 'date-asc', page: 3, pageSize: 25 });

beforeEach(() => {
  userId = '11111111-1111-1111-1111-111111111111';
  forgetListSearch();
});

describe('list return (§4.2)', () => {
  it('is the default list until the list has been seen', () => {
    expect(renderHook(() => useListReturn()).result.current).toEqual(applicationsSearchSchema.parse({}));
  });

  it('is the list as it was last seen', () => {
    renderHook(() => useRememberListSearch(LEFT));
    expect(renderHook(() => useListReturn()).result.current).toEqual(LEFT);
  });

  it("never hands one user another user's search after a sign-in in the same tab", () => {
    renderHook(() => useRememberListSearch(LEFT));
    userId = '22222222-2222-2222-2222-222222222222';
    expect(renderHook(() => useListReturn()).result.current).toEqual(applicationsSearchSchema.parse({}));
  });
});

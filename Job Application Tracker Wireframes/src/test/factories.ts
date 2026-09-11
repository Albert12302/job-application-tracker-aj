import type { Application, Note } from '@/domain/schemas';

export const TEST_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'dev-a@example.test' };

/** An application row as the database returns it: +00:00 offsets, a UTC-midnight date. */
export function applicationRow(overrides: Partial<Application> = {}): Application {
  return {
    id: crypto.randomUUID(),
    user_id: TEST_USER.id,
    date_applied: '2026-08-08T00:00:00+00:00',
    company: 'Northwind Traders',
    position: 'Senior Frontend Engineer',
    location: 'Austin, TX',
    description: 'Design-system team.',
    status: 'Applied',
    referral: false,
    starred: false,
    cover_letter_path: null,
    cover_letter_name: null,
    created_at: '2026-09-01T10:00:00+00:00',
    updated_at: '2026-09-01T10:00:00+00:00',
    ...overrides,
  };
}

export function noteRow(overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    application_id: crypto.randomUUID(),
    body: 'Recruiter screen went well.',
    created_at: '2026-09-02T10:00:00+00:00',
    updated_at: '2026-09-02T10:00:00+00:00',
    ...overrides,
  };
}

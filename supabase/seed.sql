-- Local development seed. Runs after every `npx supabase db reset`.
-- Local only: these credentials must never exist in a hosted project.
-- The repo is public, so the password, the emails and the fixed UUIDs below are all
-- known to anyone. Two commands would put them in a hosted project — neither is ever
-- correct against a linked project:
--   npx supabase db push --include-seed   (plain `db push` does NOT seed — use that)
--   npx supabase db reset --linked        (also drops everything first)
--
-- Two users, matching the launch plan (§4.1d).
--   dev-a@example.test / devpassword1234
--   dev-b@example.test / devpassword1234
-- User B exists so the §7.8 cross-user checks have a second account to run as.
--   dev-c@example.test / devpassword1234
-- User C exists only to be locked out by e2e/sign-in-function.spec.ts (§7.8.5).
-- A lockout lasts 15 minutes, so it cannot be run against an account any other
-- test signs in as.
--   dev-d@example.test / devpassword1234
-- User D is for the tests that add and delete applications
-- (e2e/applications.spec.ts, and the §7.8.4 delete test in e2e/security.spec.ts).
-- They run in parallel with e2e/auth.spec.ts, which asserts user A's exact
-- application count — so they never touch user A.
--   dev-e@example.test / devpassword1234
-- User E is for e2e/bulk-delete.spec.ts, which creates and deletes several
-- applications a run. Writes are limited per user (120 a minute, §7.1), and a full
-- run already spends nearly all of dev-d's, so that suite has a budget of its own.
--   dev-f@example.test / devpassword1234
-- User F is for the saved-filter tests in e2e/filters.spec.ts, which save and delete
-- filters. dev-a's two seeded filters are read by the read-only filter tests, so a
-- filter saved there mid-run would change what they see.
--   dev-g@example.test / devpassword1234
-- User G is for e2e/pagination.spec.ts, read-only: 23 applications, enough for three
-- pages of 10, which no other seed user has. Nothing writes as dev-g.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev-a@example.test',
   extensions.crypt('devpassword1234', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev-b@example.test',
   extensions.crypt('devpassword1234', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev-c@example.test',
   extensions.crypt('devpassword1234', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev-d@example.test',
   extensions.crypt('devpassword1234', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev-e@example.test',
   extensions.crypt('devpassword1234', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev-f@example.test',
   extensions.crypt('devpassword1234', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev-g@example.test',
   extensions.crypt('devpassword1234', extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

-- GoTrue scans these columns straight into Go strings, so a NULL is a 500 at
-- sign-in ("Database error querying schema"), not an empty value. Supabase’s own
-- user creation writes the empty string. Blanket update so any seeded user is covered.
update auth.users set
  confirmation_token         = coalesce(confirmation_token,         ''),
  recovery_token             = coalesce(recovery_token,             ''),
  email_change               = coalesce(email_change,               ''),
  email_change_token_new     = coalesce(email_change_token_new,     ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change,               ''),
  phone_change_token         = coalesce(phone_change_token,         ''),
  reauthentication_token     = coalesce(reauthentication_token,     '');

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'email', '{"sub":"11111111-1111-1111-1111-111111111111","email":"dev-a@example.test"}', now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'email', '{"sub":"22222222-2222-2222-2222-222222222222","email":"dev-b@example.test"}', now(), now()),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   'email', '{"sub":"33333333-3333-3333-3333-333333333333","email":"dev-c@example.test"}', now(), now()),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444',
   'email', '{"sub":"44444444-4444-4444-4444-444444444444","email":"dev-d@example.test"}', now(), now()),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555',
   'email', '{"sub":"55555555-5555-5555-5555-555555555555","email":"dev-e@example.test"}', now(), now()),
  (gen_random_uuid(), '66666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666',
   'email', '{"sub":"66666666-6666-6666-6666-666666666666","email":"dev-f@example.test"}', now(), now()),
  (gen_random_uuid(), '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777',
   'email', '{"sub":"77777777-7777-7777-7777-777777777777","email":"dev-g@example.test"}', now(), now())
on conflict do nothing;

update public.profiles set name = 'Dev A' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set name = 'Dev B' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set name = 'Dev D' where id = '44444444-4444-4444-4444-444444444444';
update public.profiles set name = 'Dev E' where id = '55555555-5555-5555-5555-555555555555';
update public.profiles set name = 'Dev F' where id = '66666666-6666-6666-6666-666666666666';
update public.profiles set name = 'Dev G' where id = '77777777-7777-7777-7777-777777777777';

-- Applications for user A, spread across the funnel so stats and the
-- breakdown bar have something to render.
insert into public.applications
  (id, user_id, date_applied, company, position, location, description, status, referral, starred)
values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   ((current_date - 34)::timestamp at time zone 'utc'), 'Northwind Traders', 'Senior Frontend Engineer', 'Austin, TX',
   'Design-system team. Two rounds so far.', 'Callback', true,  true),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   ((current_date - 28)::timestamp at time zone 'utc'), 'Contoso', 'Product Engineer', 'Remote',
   'Small team, broad scope.', 'Interview', false, false),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   ((current_date - 21)::timestamp at time zone 'utc'), 'Fabrikam', 'UI Engineer', 'San Francisco, CA',
   null, 'Offer', false, true),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   ((current_date - 15)::timestamp at time zone 'utc'), 'Tailspin Toys', 'Frontend Developer', 'Austin, TX',
   'Never heard back after the take-home.', 'Rejected', false, false),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   ((current_date - 9)::timestamp at time zone 'utc'),  'Adventure Works', 'Web Engineer', 'Denver, CO',
   null, 'Withdrawn', false, false),
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   ((current_date - 4)::timestamp at time zone 'utc'),  'Wide World Importers', 'Engineer, Platform UI', 'Remote',
   'Applied through a referral from Sam.', 'Applied', true, false),
  ('a0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   ((current_date - 1)::timestamp at time zone 'utc'),  'Litware', 'Senior Engineer', 'Seattle, WA',
   null, 'Applied', false, false)
on conflict (id) do nothing;

-- One application for user B: the row the §7.8 isolation test tries to reach.
insert into public.applications (id, user_id, date_applied, company, position, location, status)
values
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   ((current_date - 7)::timestamp at time zone 'utc'), 'Proseware', 'Staff Engineer', 'Remote', 'Interview')
on conflict (id) do nothing;

-- Three applications for user F, for e2e/filters.spec.ts to save filters against. No
-- saved filters: that suite makes and deletes its own.
insert into public.applications
  (id, user_id, date_applied, company, position, location, description, status, referral, starred)
values
  ('f0000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
   ((current_date - 12)::timestamp at time zone 'utc'), 'Fourth Coffee', 'Design Engineer', 'Portland, OR',
   'Brand site and ordering app.', 'Interview', true, true),
  ('f0000000-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666',
   ((current_date - 8)::timestamp at time zone 'utc'),  'Margie''s Travel', 'Frontend Engineer', 'Remote',
   null, 'Applied', false, false),
  ('f0000000-0000-0000-0000-000000000003', '66666666-6666-6666-6666-666666666666',
   ((current_date - 3)::timestamp at time zone 'utc'),  'Relecloud', 'UI Engineer', 'Portland, OR',
   'Dashboards for the cloud console.', 'Offer', false, false)
on conflict (id) do nothing;

-- Twenty-three applications for user G, for e2e/pagination.spec.ts: three pages of 10.
-- Newest first they run Alpine Ski House … Contoso Pharmaceuticals, except that:
-- - six share one date and, inserted in one statement, one created_at — so only their ids
--   order them, and the ids below are deliberately out of name order. By id they are Nod,
--   Lamna, Trey (rows 8–10) | Lucerne, Northwind Health, Humongous (rows 11–13): the tie
--   straddles the end of page 1.
-- - Blue Yonder Airlines is dated the 1st of a month, which a date read in local time shows
--   as the last day of the month before west of Greenwich (§5.4). It is always older than
--   Fabrikam Residences (33 days) and newer than Contoso Pharmaceuticals (90).
insert into public.applications
  (id, user_id, date_applied, company, position, location, status, referral, starred)
values
  ('77770000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777',
   ((current_date - 2)::timestamp at time zone 'utc'),  'Alpine Ski House', 'Frontend Engineer', 'Denver, CO', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777',
   ((current_date - 3)::timestamp at time zone 'utc'),  'Bellows College', 'Web Developer', 'Remote', 'Interview', false, true),
  ('77770000-0000-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777',
   ((current_date - 5)::timestamp at time zone 'utc'),  'Coho Winery', 'UI Engineer', 'Napa, CA', 'Applied', true, false),
  ('77770000-0000-0000-0000-000000000004', '77777777-7777-7777-7777-777777777777',
   ((current_date - 6)::timestamp at time zone 'utc'),  'Consolidated Messenger', 'Product Engineer', 'Remote', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000005', '77777777-7777-7777-7777-777777777777',
   ((current_date - 8)::timestamp at time zone 'utc'),  'Datum Corporation', 'Senior Engineer', 'Chicago, IL', 'Callback', false, false),
  ('77770000-0000-0000-0000-000000000006', '77777777-7777-7777-7777-777777777777',
   ((current_date - 9)::timestamp at time zone 'utc'),  'First Up Consultants', 'Frontend Developer', 'Remote', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000007', '77777777-7777-7777-7777-777777777777',
   ((current_date - 11)::timestamp at time zone 'utc'), 'Graphic Design Institute', 'Design Engineer', 'Austin, TX', 'Rejected', false, false),
  ('77770000-0000-0000-0000-000000000013', '77777777-7777-7777-7777-777777777777',
   ((current_date - 12)::timestamp at time zone 'utc'), 'Humongous Insurance', 'Frontend Engineer', 'Hartford, CT', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000009', '77777777-7777-7777-7777-777777777777',
   ((current_date - 12)::timestamp at time zone 'utc'), 'Lamna Healthcare', 'Web Engineer', 'Remote', 'Interview', true, false),
  ('77770000-0000-0000-0000-000000000011', '77777777-7777-7777-7777-777777777777',
   ((current_date - 12)::timestamp at time zone 'utc'), 'Lucerne Publishing', 'UI Developer', 'New York, NY', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000008', '77777777-7777-7777-7777-777777777777',
   ((current_date - 12)::timestamp at time zone 'utc'), 'Nod Publishers', 'Frontend Engineer', 'Remote', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000012', '77777777-7777-7777-7777-777777777777',
   ((current_date - 12)::timestamp at time zone 'utc'), 'Northwind Health', 'Product Engineer', 'Seattle, WA', 'Interview', false, false),
  ('77770000-0000-0000-0000-000000000010', '77777777-7777-7777-7777-777777777777',
   ((current_date - 12)::timestamp at time zone 'utc'), 'Trey Research', 'Senior Engineer', 'Remote', 'Withdrawn', false, false),
  ('77770000-0000-0000-0000-000000000014', '77777777-7777-7777-7777-777777777777',
   ((current_date - 14)::timestamp at time zone 'utc'), 'Southridge Video', 'Web Developer', 'Los Angeles, CA', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000015', '77777777-7777-7777-7777-777777777777',
   ((current_date - 16)::timestamp at time zone 'utc'), 'VanArsdel', 'Frontend Engineer', 'Remote', 'Interview', false, false),
  ('77770000-0000-0000-0000-000000000016', '77777777-7777-7777-7777-777777777777',
   ((current_date - 18)::timestamp at time zone 'utc'), 'Woodgrove Bank', 'UI Engineer', 'Charlotte, NC', 'Offer', true, true),
  ('77770000-0000-0000-0000-000000000017', '77777777-7777-7777-7777-777777777777',
   ((current_date - 20)::timestamp at time zone 'utc'), 'Wingtip Toys', 'Design Engineer', 'Remote', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000018', '77777777-7777-7777-7777-777777777777',
   ((current_date - 23)::timestamp at time zone 'utc'), 'School of Fine Art', 'Web Engineer', 'Boston, MA', 'Rejected', false, false),
  ('77770000-0000-0000-0000-000000000019', '77777777-7777-7777-7777-777777777777',
   ((current_date - 26)::timestamp at time zone 'utc'), 'Munson''s Pickles', 'Frontend Developer', 'Remote', 'Interview', false, false),
  ('77770000-0000-0000-0000-000000000020', '77777777-7777-7777-7777-777777777777',
   ((current_date - 29)::timestamp at time zone 'utc'), 'Tasmanian Traders', 'Product Engineer', 'Portland, OR', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000021', '77777777-7777-7777-7777-777777777777',
   ((current_date - 33)::timestamp at time zone 'utc'), 'Fabrikam Residences', 'UI Developer', 'Remote', 'Callback', false, false),
  ('77770000-0000-0000-0000-000000000022', '77777777-7777-7777-7777-777777777777',
   (date_trunc('month', (current_date - 40)::timestamp) at time zone 'utc'), 'Blue Yonder Airlines', 'Senior Engineer', 'Dallas, TX', 'Applied', false, false),
  ('77770000-0000-0000-0000-000000000023', '77777777-7777-7777-7777-777777777777',
   ((current_date - 90)::timestamp at time zone 'utc'), 'Contoso Pharmaceuticals', 'Frontend Engineer', 'Remote', 'Applied', false, false)
on conflict (id) do nothing;

insert into public.notes (application_id, body, created_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'Recruiter screen went well. Take-home next.', now() - interval '30 days'),
  ('a0000000-0000-0000-0000-000000000001', 'Take-home submitted. Waiting on the panel.',  now() - interval '24 days'),
  ('a0000000-0000-0000-0000-000000000003', 'Verbal offer. Written version due Friday.',   now() - interval '3 days')
on conflict do nothing;

-- History rows the app would have written (§2). Creation row has from_status null.
insert into public.status_history (application_id, from_status, to_status, changed_at)
values
  ('a0000000-0000-0000-0000-000000000001', null,        'Applied',   now() - interval '34 days'),
  ('a0000000-0000-0000-0000-000000000001', 'Applied',   'Interview', now() - interval '27 days'),
  ('a0000000-0000-0000-0000-000000000001', 'Interview', 'Callback',  now() - interval '11 days'),
  ('a0000000-0000-0000-0000-000000000003', null,        'Applied',   now() - interval '21 days'),
  ('a0000000-0000-0000-0000-000000000003', 'Applied',   'Interview', now() - interval '16 days'),
  ('a0000000-0000-0000-0000-000000000003', 'Interview', 'Offer',     now() - interval '3 days'),
  -- Interviewed, then rejected: counts as Interviewed though its status is Rejected (§4.5).
  ('a0000000-0000-0000-0000-000000000004', null,        'Applied',   now() - interval '15 days'),
  ('a0000000-0000-0000-0000-000000000004', 'Applied',   'Interview', now() - interval '10 days'),
  ('a0000000-0000-0000-0000-000000000004', 'Interview', 'Rejected',  now() - interval '5 days')
on conflict do nothing;

-- created_at is spelled out: tab order is creation order (§2), and one insert
-- statement gives every row the same now(), leaving the order to the random ids
-- that break the tie — a different tab order after each db reset.
insert into public.saved_filters (user_id, name, statuses, referral, starred, location, created_at)
values
  ('11111111-1111-1111-1111-111111111111', 'Live', array['Interview','Callback','Offer']::public.application_status[], 'any', 'any', null, now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', 'Austin referrals', '{}', 'yes', 'any', 'Austin, TX', now() - interval '1 day')
on conflict do nothing;

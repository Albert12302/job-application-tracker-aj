-- Local development seed. Runs after every `npx supabase db reset`.
-- Local only: these credentials must never exist in a hosted project.
--
-- Two users, matching the launch plan (§4.1d).
--   dev-a@example.test / devpassword1234
--   dev-b@example.test / devpassword1234
-- User B exists so the §7.8 cross-user checks have a second account to run as.

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
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'email', '{"sub":"11111111-1111-1111-1111-111111111111","email":"dev-a@example.test"}', now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   'email', '{"sub":"22222222-2222-2222-2222-222222222222","email":"dev-b@example.test"}', now(), now())
on conflict do nothing;

update public.profiles set name = 'Dev A' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set name = 'Dev B' where id = '22222222-2222-2222-2222-222222222222';

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
  ('a0000000-0000-0000-0000-000000000004', null,        'Applied',   now() - interval '15 days'),
  ('a0000000-0000-0000-0000-000000000004', 'Applied',   'Rejected',  now() - interval '5 days')
on conflict do nothing;

insert into public.saved_filters (user_id, name, statuses, referral, starred, location)
values
  ('11111111-1111-1111-1111-111111111111', 'Live', array['Interview','Callback','Offer']::public.application_status[], 'any', 'any', null),
  ('11111111-1111-1111-1111-111111111111', 'Austin referrals', '{}', 'yes', 'any', 'Austin, TX')
on conflict do nothing;

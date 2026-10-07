begin;
select plan(11);

-- Schema shape
select has_table('public', 'companies', 'companies table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'workspaces', 'workspaces table exists');
select has_table('public', 'workspace_members', 'workspace_members table exists');
select has_table('public', 'invites', 'invites table exists');

-- RLS is enabled (deny-by-default: no policies yet, so enabling RLS alone
-- blocks all non-owner access until §1.5 adds the role-based policies)
select is(
  (select relrowsecurity from pg_class where oid = 'public.workspaces'::regclass),
  true,
  'RLS is enabled on workspaces'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.workspace_members'::regclass),
  true,
  'RLS is enabled on workspace_members'
);

-- Fixture: two companies, two workspaces, one owner each
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.com');

insert into companies (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Company A'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Company B');

insert into workspaces (id, company_id, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Workspace A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Workspace B');

insert into workspace_members (workspace_id, user_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner');

-- Sanity check as the bypassing postgres role: the fixture data is really there,
-- so a later 0-row result proves RLS blocked it, not that the data is missing.
select is(
  (select count(*)::int from workspace_members where workspace_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  1,
  'fixture: workspace A has one member (checked as bypass role)'
);

-- As an authenticated non-member of workspace A (member of workspace B only),
-- RLS must return zero rows for workspace A's data (deny-by-default: no
-- policies have been added yet, so this also holds for workspace B's own
-- member querying their own workspace -- that gap closes in §1.5).
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from workspaces where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0,
  'non-member cannot see workspace A (RLS deny-by-default)'
);
select is(
  (select count(*)::int from workspace_members where workspace_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0,
  'non-member cannot see workspace A members (RLS deny-by-default)'
);
select is(
  (select count(*)::int from workspaces where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0,
  'even workspace B''s own owner sees 0 rows pre-policy (deny-by-default, no policies yet)'
);

reset role;

select * from finish();
rollback;

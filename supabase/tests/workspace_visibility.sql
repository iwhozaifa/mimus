begin;
select plan(14);

-- Fixture mirrors connected_accounts_rls.sql's shape:
-- Owner (O) -> Manager A (MA) -> {Member B (MB), Member D (MD)}
-- Owner (O) -> Member C (MC)  [MC is a peer of MA, not of MB/MD]
-- Plus a second, unrelated workspace with its own owner (outsider).
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000f', 'owner@example.com'),
  ('a0000000-0000-0000-0000-00000000000a', 'manager-a@example.com'),
  ('a0000000-0000-0000-0000-00000000000b', 'member-b@example.com'),
  ('a0000000-0000-0000-0000-00000000000c', 'member-c@example.com'),
  ('a0000000-0000-0000-0000-00000000000d', 'member-d@example.com'),
  ('a0000000-0000-0000-0000-0000000000e1', 'outsider-owner@example.com');

insert into companies (id, name) values
  ('b0000000-0000-0000-0000-000000000001', 'Co'),
  ('b0000000-0000-0000-0000-000000000002', 'Other Co');
insert into workspaces (id, company_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'WS'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Other WS');

insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('d0000000-0000-0000-0000-00000000000f', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000f', 'owner', null);
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('d0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'manager', 'd0000000-0000-0000-0000-00000000000f');
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('d0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', 'member', 'd0000000-0000-0000-0000-00000000000a'),
  ('d0000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d', 'member', 'd0000000-0000-0000-0000-00000000000a'),
  ('d0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c', 'member', 'd0000000-0000-0000-0000-00000000000f');
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('d0000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000e1', 'owner', null);

-- 1. Peer visibility on workspace_members: any active member of WS sees every
--    row in WS (5 rows), not just their own (contrast with the pre-0011 self-select-only behavior).
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(
  (select count(*)::int from workspace_members where workspace_id = 'c0000000-0000-0000-0000-000000000001'),
  5,
  'a member sees every row in their own workspace, not just their own'
);
reset role;

-- 2. An outsider (member of a different workspace) cannot see any rows in WS.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select is(
  (select count(*)::int from workspace_members where workspace_id = 'c0000000-0000-0000-0000-000000000001'),
  0,
  'an outsider (different workspace) cannot see WS''s workspace_members rows'
);
reset role;

-- 3. Owner successfully demotes manager A to member.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000f","role":"authenticated"}';
update workspace_members set role = 'member' where id = 'd0000000-0000-0000-0000-00000000000a';
select is(
  (select role from workspace_members where id = 'd0000000-0000-0000-0000-00000000000a'),
  'member',
  'owner successfully demotes a manager to member'
);
-- put it back for the rest of the suite
update workspace_members set role = 'manager' where id = 'd0000000-0000-0000-0000-00000000000a';
reset role;

-- 4. Owner attempting to promote member B to owner is blocked (no ownership
--    transfer feature): the row is eligible (USING passes) but the literal
--    role-escalation guard in WITH CHECK rejects it, so this throws.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000f","role":"authenticated"}';
select throws_ok(
  $$ update workspace_members set role = 'owner' where id = 'd0000000-0000-0000-0000-00000000000b' $$,
  'new row violates row-level security policy for table "workspace_members"',
  'owner cannot promote anyone to owner through this policy'
);
reset role;

-- 5. Owner updating another owner's row: 0 rows, no error (can_manage_member
--    excludes owner-on-owner; USING simply fails to match, no throw).
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000f","role":"authenticated"}';
update workspace_members set role = 'member' where id = 'd0000000-0000-0000-0000-0000000000e1';
select is(
  (select count(*)::int from workspace_members where id = 'd0000000-0000-0000-0000-0000000000e1' and role = 'owner'),
  0,
  'owner-on-owner update affected 0 rows (checked via bypass role below is the real proof)'
);
reset role;
-- Prove via the bypass role that the other workspace's owner row is untouched.
select is(
  (select role from workspace_members where id = 'd0000000-0000-0000-0000-0000000000e1'),
  'owner',
  'the other workspace''s owner row was not actually changed (0 rows affected)'
);

-- 6. Manager A successfully removes (status-only) member B, whom they manage.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update workspace_members set status = 'removed' where id = 'd0000000-0000-0000-0000-00000000000b';
select is(
  (select status from workspace_members where id = 'd0000000-0000-0000-0000-00000000000b'),
  'removed',
  'manager successfully removes (status-only) a member they manage'
);
update workspace_members set status = 'active' where id = 'd0000000-0000-0000-0000-00000000000b';
reset role;

-- 7. Manager A attempting to promote member D to manager is blocked (a
--    manager can change status, never role).
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$ update workspace_members set role = 'manager' where id = 'd0000000-0000-0000-0000-00000000000d' $$,
  'new row violates row-level security policy for table "workspace_members"',
  'manager cannot promote a member to manager'
);
reset role;

-- 8. Manager A CAN manage member C (can_manage_member gates by role only,
--    not workspace_members.manager_id reporting line -- this is the
--    existing, unchanged semantics of can_manage_member, proven here so a
--    future reader doesn't mistake this policy for reporting-line scoped).
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update workspace_members set status = 'removed' where id = 'd0000000-0000-0000-0000-00000000000c';
select is(
  (select status from workspace_members where id = 'd0000000-0000-0000-0000-00000000000c'),
  'removed',
  'a manager can manage any member in the workspace, not only direct reports (can_manage_member has no reporting-line scoping)'
);
update workspace_members set status = 'active' where id = 'd0000000-0000-0000-0000-00000000000c';
reset role;

-- 9. Manager A touching the owner: 0 rows, no error.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update workspace_members set status = 'removed' where id = 'd0000000-0000-0000-0000-00000000000f';
reset role;
select is(
  (select status from workspace_members where id = 'd0000000-0000-0000-0000-00000000000f'),
  'active',
  'a manager cannot touch the owner''s row (0 rows affected, checked via bypass role)'
);

-- 10. A plain member attempting to update any row, including their own, is
--     rejected outright (members have no UPDATE policy at all).
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
update workspace_members set status = 'removed' where id = 'd0000000-0000-0000-0000-00000000000b';
reset role;
select is(
  (select status from workspace_members where id = 'd0000000-0000-0000-0000-00000000000b'),
  'active',
  'a plain member cannot update even their own row (0 rows affected, checked via bypass role)'
);

-- 11. profiles: a brand-new profile row per user (profiles gets no trigger
--     here, so insert directly as the bypass role for this fixture).
insert into profiles (id, email) values
  ('a0000000-0000-0000-0000-00000000000f', 'owner@example.com'),
  ('a0000000-0000-0000-0000-00000000000b', 'member-b@example.com'),
  ('a0000000-0000-0000-0000-0000000000e1', 'outsider-owner@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-00000000000f","role":"authenticated"}';
select is(
  (select count(*)::int from profiles where id = 'a0000000-0000-0000-0000-00000000000f'),
  1,
  'a user can always see their own profile'
);
select is(
  (select count(*)::int from profiles where id = 'a0000000-0000-0000-0000-00000000000b'),
  1,
  'a workspace peer''s profile is visible'
);
select is(
  (select count(*)::int from profiles where id = 'a0000000-0000-0000-0000-0000000000e1'),
  0,
  'an outsider''s profile is not visible'
);
reset role;

select * from finish();
rollback;

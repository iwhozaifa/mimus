begin;
select plan(2);

insert into auth.users (id, email) values
  ('aa000000-0000-0000-0000-000000000001', 'self-a@example.com'),
  ('aa000000-0000-0000-0000-000000000002', 'self-b@example.com');

insert into companies (id, name) values ('aa000000-0000-0000-0000-000000000003', 'Co');
insert into workspaces (id, company_id, name)
  values ('aa000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000003', 'WS');

insert into workspace_members (workspace_id, user_id, role) values
  ('aa000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000001', 'owner'),
  ('aa000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000002', 'member');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aa000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from workspace_members where user_id = 'aa000000-0000-0000-0000-000000000001'),
  1,
  'a user can see their own membership row'
);
-- Peer visibility was added in 0011_workspace_members_profiles_visibility.sql
-- (workspace_visibility.sql covers that policy in depth) -- a workspace peer
-- is now visible too, on top of the self-select floor this file tests.
select is(
  (select count(*)::int from workspace_members where user_id = 'aa000000-0000-0000-0000-000000000002'),
  1,
  'a workspace peer''s membership row is also visible (0011 peer-visibility policy)'
);

reset role;
select * from finish();
rollback;

begin;
select plan(6);

-- A user who has logged AI requests, sent an invite and manages a
-- teammate -- every foreign key that pointed at them without a delete
-- rule used to block deleting their auth.users row outright.
insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'ad-leaver@example.com'),
  ('ad000000-0000-0000-0000-000000000002', 'ad-stayer@example.com');

insert into companies (id, name) values ('ad000000-0000-0000-0000-000000000003', 'Co');
insert into workspaces (id, company_id, name)
  values ('ad000000-0000-0000-0000-000000000004', 'ad000000-0000-0000-0000-000000000003', 'WS');

insert into workspace_members (id, workspace_id, user_id, role) values
  ('ad000000-0000-0000-0000-000000000005', 'ad000000-0000-0000-0000-000000000004',
   'ad000000-0000-0000-0000-000000000001', 'manager');
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('ad000000-0000-0000-0000-000000000006', 'ad000000-0000-0000-0000-000000000004',
   'ad000000-0000-0000-0000-000000000002', 'owner', 'ad000000-0000-0000-0000-000000000005');

insert into invites (id, workspace_id, email, role, invited_by, token, expires_at) values
  ('ad000000-0000-0000-0000-000000000007', 'ad000000-0000-0000-0000-000000000004',
   'ad-invitee@example.com', 'member', 'ad000000-0000-0000-0000-000000000005',
   'ad-token', now() + interval '7 days');

select log_agent_request('ad000000-0000-0000-0000-000000000004', 'ad000000-0000-0000-0000-000000000001',
  'lookup', 'interactive', 'fast', 'gpt-6-luna', 10, 20, 0.001, '{}'::jsonb, 'ok');

select lives_ok(
  $$ delete from auth.users where id = 'ad000000-0000-0000-0000-000000000001' $$,
  'a user with agent_logs, sent invites and reports can be deleted'
);

select is(
  (select count(*)::int from agent_logs
    where workspace_id = 'ad000000-0000-0000-0000-000000000004' and user_id is null),
  1,
  'their agent_logs entries are kept for the workspace but no longer linked to them'
);

select is(
  (select invited_by from invites where id = 'ad000000-0000-0000-0000-000000000007'),
  null,
  'invites they sent are kept, with invited_by cleared'
);

select is(
  (select manager_id from workspace_members where id = 'ad000000-0000-0000-0000-000000000006'),
  null,
  'their reports are kept, with manager_id cleared'
);

select is(
  (select count(*)::int from profiles where id = 'ad000000-0000-0000-0000-000000000001'),
  0,
  'their profile is deleted'
);

select is(
  (select count(*)::int from workspace_members where user_id = 'ad000000-0000-0000-0000-000000000001'),
  0,
  'their memberships are deleted'
);

select * from finish();
rollback;

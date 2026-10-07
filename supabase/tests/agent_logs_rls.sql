begin;
select plan(6);

select has_table('public', 'agent_logs', 'agent_logs table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.agent_logs'::regclass),
  true,
  'RLS is enabled on agent_logs'
);

insert into auth.users (id, email) values
  ('ba000000-0000-0000-0000-000000000001', 'al-owner@example.com'),
  ('ba000000-0000-0000-0000-000000000002', 'al-member@example.com');

insert into companies (id, name) values ('ba000000-0000-0000-0000-000000000003', 'Co');
insert into workspaces (id, company_id, name)
  values ('ba000000-0000-0000-0000-000000000004', 'ba000000-0000-0000-0000-000000000003', 'WS');

insert into workspace_members (workspace_id, user_id, role) values
  ('ba000000-0000-0000-0000-000000000004', 'ba000000-0000-0000-0000-000000000001', 'owner'),
  ('ba000000-0000-0000-0000-000000000004', 'ba000000-0000-0000-0000-000000000002', 'member');

-- Insert always works through the sanctioned function, even for a Member
-- whose role grants them no direct table access.
set local role authenticated;
set local request.jwt.claims to '{"sub":"ba000000-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
  $$ select log_agent_request('ba000000-0000-0000-0000-000000000004', 'ba000000-0000-0000-0000-000000000002',
       'lookup', 'interactive', 'fast', 'claude-haiku-4-5', 10, 20, 0.001, '{}'::jsonb, 'ok') $$,
  'a Member can log an agent request through the sanctioned function'
);

-- But a raw insert bypassing that function is rejected -- there is no
-- direct INSERT policy on the table.
select throws_ok(
  $$ insert into agent_logs (workspace_id, user_id, nature, priority, status)
     values ('ba000000-0000-0000-0000-000000000004', 'ba000000-0000-0000-0000-000000000002', 'lookup', 'interactive', 'ok') $$,
  'new row violates row-level security policy for table "agent_logs"',
  'a raw insert into agent_logs is rejected (no direct INSERT policy)'
);

-- A Member cannot read the log, even their own entry -- audit log is
-- Owner-only, with no self-visibility exception.
select is(
  (select count(*)::int from agent_logs where workspace_id = 'ba000000-0000-0000-0000-000000000004'),
  0,
  'a Member cannot read the audit log at all'
);

reset role;

-- The Owner can.
set local role authenticated;
set local request.jwt.claims to '{"sub":"ba000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from agent_logs where workspace_id = 'ba000000-0000-0000-0000-000000000004'),
  1,
  'the Owner can read the audit log'
);

reset role;
select * from finish();
rollback;

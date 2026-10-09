begin;
select plan(5);

select has_table('public', 'agent_spend_counters', 'agent_spend_counters table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.agent_spend_counters'::regclass),
  true,
  'RLS is enabled on agent_spend_counters'
);

insert into auth.users (id, email) values
  ('bc000000-0000-0000-0000-000000000001', 'sc-owner@example.com'),
  ('bc000000-0000-0000-0000-000000000002', 'sc-member@example.com');
insert into companies (id, name) values ('bc000000-0000-0000-0000-000000000003', 'Co');
insert into workspaces (id, company_id, name)
  values ('bc000000-0000-0000-0000-000000000004', 'bc000000-0000-0000-0000-000000000003', 'WS');
insert into workspace_members (workspace_id, user_id, role) values
  ('bc000000-0000-0000-0000-000000000004', 'bc000000-0000-0000-0000-000000000001', 'owner'),
  ('bc000000-0000-0000-0000-000000000004', 'bc000000-0000-0000-0000-000000000002', 'member');

select record_agent_spend('bc000000-0000-0000-0000-000000000004', '2026-10-09', 1.25);

set local role authenticated;
set local request.jwt.claims to '{"sub":"bc000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from agent_spend_counters where workspace_id = 'bc000000-0000-0000-0000-000000000004'),
  0,
  'a Member cannot read spend counters'
);
select throws_ok(
  $$ select record_agent_spend('bc000000-0000-0000-0000-000000000004', '2026-10-09', -100) $$,
  '42501',
  null,
  'a signed-in user cannot call record_agent_spend directly (service role only)'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"bc000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select cost_usd from agent_spend_counters where workspace_id = 'bc000000-0000-0000-0000-000000000004'),
  1.25::numeric,
  'the Owner can read spend counters'
);

reset role;
select * from finish();
rollback;

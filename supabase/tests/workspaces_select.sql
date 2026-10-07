begin;
select plan(2);

insert into auth.users (id, email) values
  ('bb000000-0000-0000-0000-000000000001', 'ws-member@example.com'),
  ('bb000000-0000-0000-0000-000000000002', 'ws-outsider@example.com');

insert into companies (id, name) values ('bb000000-0000-0000-0000-000000000003', 'Co');
insert into workspaces (id, company_id, name)
  values ('bb000000-0000-0000-0000-000000000004', 'bb000000-0000-0000-0000-000000000003', 'WS');

insert into workspace_members (workspace_id, user_id, role) values
  ('bb000000-0000-0000-0000-000000000004', 'bb000000-0000-0000-0000-000000000001', 'owner');

set local role authenticated;
set local request.jwt.claims to '{"sub":"bb000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from workspaces where id = 'bb000000-0000-0000-0000-000000000004'),
  1,
  'an active member can read their own workspace row'
);

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"bb000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from workspaces where id = 'bb000000-0000-0000-0000-000000000004'),
  0,
  'a non-member cannot read another workspace''s row'
);

reset role;
select * from finish();
rollback;

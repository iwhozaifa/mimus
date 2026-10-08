begin;
select plan(3);

select has_column('public', 'connected_accounts', 'provider_team_id', 'provider_team_id column exists');

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000020c', 'member-team-id@example.com');
insert into companies (id, name) values ('d0000000-0000-0000-0000-000000000004', 'Co TeamId');
insert into workspaces (id, company_id, name)
  values ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'WS TeamId');
insert into connected_accounts (id, workspace_id, owner_user_id, provider, account_type) values
  ('61111111-3333-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-00000000020c', 'slack', 'slack');

select is(
  (select provider_team_id from connected_accounts where id = '61111111-3333-0000-0000-000000000001'),
  null,
  'provider_team_id defaults to null -- existing rows/connectors are unaffected'
);

update connected_accounts set provider_team_id = 'T12345'
where id = '61111111-3333-0000-0000-000000000001';

select is(
  (select provider_team_id from connected_accounts where id = '61111111-3333-0000-0000-000000000001'),
  'T12345',
  'provider_team_id is updatable'
);

select * from finish();
rollback;

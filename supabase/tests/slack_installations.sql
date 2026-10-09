begin;
select plan(7);

select has_table('public', 'slack_installations', 'slack_installations table exists');
select col_is_pk('public', 'slack_installations', 'team_id', 'team_id is the primary key');
select has_column('public', 'connected_accounts', 'provider_team_name', 'provider_team_name column exists');
select has_column('public', 'connected_accounts', 'provider_team_domain', 'provider_team_domain column exists');

insert into slack_installations (team_id, team_name, encrypted_bot_token, key_version)
values ('T_PGTAP', 'Acme', '\x00'::bytea, 1);

-- Bot tokens are as sensitive as connected_account_secrets: no end-user
-- role may read or write them, regardless of workspace membership.
set local role authenticated;
set local request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-00000000020d"}';

select throws_ok(
  $$ select * from slack_installations $$,
  'permission denied for table slack_installations',
  'authenticated role cannot read slack_installations'
);
select throws_ok(
  $$ insert into slack_installations (team_id, encrypted_bot_token, key_version) values ('T_X', '\x00'::bytea, 1) $$,
  'permission denied for table slack_installations',
  'authenticated role cannot insert into slack_installations'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from slack_installations $$,
  'permission denied for table slack_installations',
  'anon role cannot read slack_installations'
);

reset role;
select * from finish();
rollback;

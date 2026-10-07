begin;
select plan(22);

select has_table('public', 'connected_accounts', 'connected_accounts table exists');
select has_table('public', 'connected_account_secrets', 'connected_account_secrets table exists');
select has_table('public', 'connected_account_shares', 'connected_account_shares table exists');

-- Fixture: Owner (O) -> Manager A (MA) -> {Member B (MB), Member D (MD)}
--          Owner (O) -> Member C (MC)  [MC is a peer of MA, not of MB/MD]
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000f', 'owner@example.com'),
  ('c0000000-0000-0000-0000-00000000000a', 'manager-a@example.com'),
  ('c0000000-0000-0000-0000-00000000000b', 'member-b@example.com'),
  ('c0000000-0000-0000-0000-00000000000c', 'member-c@example.com'),
  ('c0000000-0000-0000-0000-00000000000d', 'member-d@example.com');

insert into companies (id, name) values ('d0000000-0000-0000-0000-000000000001', 'Co');
insert into workspaces (id, company_id, name)
  values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'WS');

insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('f0000000-0000-0000-0000-00000000000f', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000f', 'owner', null);
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('f0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'manager', 'f0000000-0000-0000-0000-00000000000f');
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('f0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'member', 'f0000000-0000-0000-0000-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000d', 'member', 'f0000000-0000-0000-0000-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'member', 'f0000000-0000-0000-0000-00000000000f');

-- Member B connects an account.
insert into connected_accounts (id, workspace_id, owner_user_id, provider, account_type, visibility) values
  ('11111111-2222-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'google', 'email', 'private');

-- Private: only the connector sees it, not even the workspace owner.
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b'), true, 'private: connector sees their own account');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000f'), false, 'private: workspace owner does not see it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'), false, 'private: connector''s manager does not see it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c'), false, 'private: unrelated member does not see it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000d'), false, 'private: peer member does not see it');

update connected_accounts set visibility = 'team' where id = '11111111-2222-0000-0000-000000000001';

-- Team: connector, their manager, peers under the same manager, and the workspace owner.
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b'), true, 'team: connector sees their own account');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'), true, 'team: connector''s manager sees it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000d'), true, 'team: a peer under the same manager sees it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000f'), true, 'team: the workspace owner sees it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c'), false, 'team: a member under a different manager does not see it');

update connected_accounts set visibility = 'company' where id = '11111111-2222-0000-0000-000000000001';

-- Company, no explicit shares yet: connector + workspace owner only.
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b'), true, 'company (no shares): connector sees it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000f'), true, 'company (no shares): workspace owner sees it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'), false, 'company (no shares): connector''s manager does not see it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c'), false, 'company (no shares): unrelated member does not see it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000d'), false, 'company (no shares): peer member does not see it');

insert into connected_account_shares (connected_account_id, shared_with_user_id)
  values ('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c');

-- Company, owner-curated share added for member C: now they see it, no one else gains access.
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c'), true, 'company (shared): the shared-with member now sees it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'), false, 'company (shared): a non-shared member still does not see it');
select is(can_see_connected_account('11111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000d'), false, 'company (shared): another non-shared member still does not see it');

-- Secrets are never exposed to any user role, only the service role.
set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000f","role":"authenticated"}';
select throws_ok(
  $$ select * from connected_account_secrets $$,
  'permission denied for table connected_account_secrets',
  'authenticated role cannot read connected_account_secrets at all'
);
reset role;

select * from finish();
rollback;

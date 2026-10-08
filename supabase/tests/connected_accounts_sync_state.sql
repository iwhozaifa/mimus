begin;
select plan(6);

select has_column('public', 'connected_accounts', 'sync_cursor', 'sync_cursor column exists');
select has_column('public', 'connected_accounts', 'watch_resource_id', 'watch_resource_id column exists');
select has_column('public', 'connected_accounts', 'watch_channel_id', 'watch_channel_id column exists');
select has_column('public', 'connected_accounts', 'watch_expires_at', 'watch_expires_at column exists');

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000020b', 'member-b-sync@example.com');
insert into companies (id, name) values ('d0000000-0000-0000-0000-000000000003', 'Co Sync');
insert into workspaces (id, company_id, name)
  values ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'WS Sync');
insert into connected_accounts (id, workspace_id, owner_user_id, provider, account_type) values
  ('61111111-2222-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-00000000020b', 'google', 'email');

select is(
  (select sync_cursor from connected_accounts where id = '61111111-2222-0000-0000-000000000001'),
  null,
  'sync_cursor defaults to null -- existing rows/connectors are unaffected'
);

update connected_accounts set
  sync_cursor = 'history-id-123',
  watch_resource_id = 'resource-1',
  watch_channel_id = 'channel-1',
  watch_expires_at = now() + interval '7 days'
where id = '61111111-2222-0000-0000-000000000001';

select is(
  (select sync_cursor from connected_accounts where id = '61111111-2222-0000-0000-000000000001'),
  'history-id-123',
  'sync-state columns are updatable'
);

select * from finish();
rollback;

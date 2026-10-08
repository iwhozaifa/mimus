begin;
select plan(34);

select has_table('public', 'messages', 'messages table exists');
select has_table('public', 'events', 'events table exists');
select has_table('public', 'people', 'people table exists');
select has_table('public', 'message_participants', 'message_participants table exists');
select has_table('public', 'event_attendees', 'event_attendees table exists');

-- Same fixture org chart as connected_accounts_rls.sql:
-- Owner (O) -> Manager A (MA) -> {Member B (MB), Member D (MD)}
-- Owner (O) -> Member C (MC)  [MC is a peer of MA, not of MB/MD]
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000f', 'owner-mep@example.com'),
  ('c0000000-0000-0000-0000-00000000000a', 'manager-a-mep@example.com'),
  ('c0000000-0000-0000-0000-00000000000b', 'member-b-mep@example.com'),
  ('c0000000-0000-0000-0000-00000000000c', 'member-c-mep@example.com'),
  ('c0000000-0000-0000-0000-00000000000d', 'member-d-mep@example.com');

insert into companies (id, name) values ('d0000000-0000-0000-0000-000000000002', 'Co MEP');
insert into workspaces (id, company_id, name)
  values ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'WS MEP');

insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('f0000000-0000-0000-0000-00000000010f', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000f', 'owner', null);
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('f0000000-0000-0000-0000-00000000010a', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000a', 'manager', 'f0000000-0000-0000-0000-00000000010f');
insert into workspace_members (id, workspace_id, user_id, role, manager_id) values
  ('f0000000-0000-0000-0000-00000000010b', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000b', 'member', 'f0000000-0000-0000-0000-00000000010a'),
  ('f0000000-0000-0000-0000-00000000010d', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000d', 'member', 'f0000000-0000-0000-0000-00000000010a'),
  ('f0000000-0000-0000-0000-00000000010c', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'member', 'f0000000-0000-0000-0000-00000000010f');

-- Member B connects a Google email account that owns all the content rows below.
insert into connected_accounts (id, workspace_id, owner_user_id, provider, account_type, visibility) values
  ('21111111-2222-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000b', 'google', 'email', 'private');

insert into people (id, workspace_id, connected_account_id, external_person_id, email, display_name) values
  ('31111111-2222-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', '21111111-2222-0000-0000-000000000001', 'ext-person-1', 'contact@example.com', 'A Contact');

insert into messages (id, workspace_id, connected_account_id, provider_message_id, subject, direction) values
  ('41111111-2222-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', '21111111-2222-0000-0000-000000000001', 'gmail-msg-1', 'Hello', 'inbound');

insert into message_participants (message_id, person_id, role) values
  ('41111111-2222-0000-0000-000000000001', '31111111-2222-0000-0000-000000000001', 'to');

insert into events (id, workspace_id, connected_account_id, provider_event_id, title, starts_at, ends_at) values
  ('51111111-2222-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', '21111111-2222-0000-0000-000000000001', 'gcal-evt-1', 'Sync', now(), now() + interval '30 minutes');

insert into event_attendees (event_id, person_id, response_status) values
  ('51111111-2222-0000-0000-000000000001', '31111111-2222-0000-0000-000000000001', 'accepted');

-- Private: only the connector (Member B) sees their content, no one else.
set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*) from messages)::int, 1, 'private: connector sees their own message');
select is((select count(*) from events)::int, 1, 'private: connector sees their own event');
select is((select count(*) from people)::int, 1, 'private: connector sees their own person');
select is((select count(*) from message_participants)::int, 1, 'private: connector sees message_participants via join-through');
select is((select count(*) from event_attendees)::int, 1, 'private: connector sees event_attendees via join-through');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*) from messages)::int, 0, 'private: unrelated member sees no messages');
select is((select count(*) from events)::int, 0, 'private: unrelated member sees no events');
select is((select count(*) from people)::int, 0, 'private: unrelated member sees no people');
reset role;

update connected_accounts set visibility = 'team' where id = '21111111-2222-0000-0000-000000000001';

-- Team: connector, their manager, peers under the same manager, and the workspace owner.
set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*) from messages)::int, 1, 'team: manager sees the message');
select is((select count(*) from events)::int, 1, 'team: manager sees the event');
select is((select count(*) from people)::int, 1, 'team: manager sees the person');
select is((select count(*) from message_participants)::int, 1, 'team: manager sees message_participants via join-through');
select is((select count(*) from event_attendees)::int, 1, 'team: manager sees event_attendees via join-through');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000d","role":"authenticated"}';
select is((select count(*) from messages)::int, 1, 'team: peer under same manager sees the message');
select is((select count(*) from events)::int, 1, 'team: peer under same manager sees the event');
select is((select count(*) from people)::int, 1, 'team: peer under same manager sees the person');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*) from messages)::int, 0, 'team: unrelated member sees no messages');
select is((select count(*) from events)::int, 0, 'team: unrelated member sees no events');
select is((select count(*) from people)::int, 0, 'team: unrelated member sees no people');
select is((select count(*) from message_participants)::int, 0, 'team: unrelated member sees no message_participants');
select is((select count(*) from event_attendees)::int, 0, 'team: unrelated member sees no event_attendees');
reset role;

update connected_accounts set visibility = 'company' where id = '21111111-2222-0000-0000-000000000001';
insert into connected_account_shares (connected_account_id, shared_with_user_id)
  values ('21111111-2222-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c');

-- Company, owner-curated share granted to Member C: they see it, a non-shared peer does not.
set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select is((select count(*) from messages)::int, 1, 'company (shared): shared member sees the message');
select is((select count(*) from events)::int, 1, 'company (shared): shared member sees the event');
select is((select count(*) from people)::int, 1, 'company (shared): shared member sees the person');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000d","role":"authenticated"}';
select is((select count(*) from messages)::int, 0, 'company (shared): non-shared member sees no messages');
select is((select count(*) from events)::int, 0, 'company (shared): non-shared member sees no events');
select is((select count(*) from people)::int, 0, 'company (shared): non-shared member sees no people');
reset role;

-- Idempotency constraints: a duplicate provider id under the same connected
-- account is rejected (this is what makes connector backfills re-run safe).
select throws_ok(
  $$ insert into messages (workspace_id, connected_account_id, provider_message_id, subject, direction)
     values ('e0000000-0000-0000-0000-000000000002', '21111111-2222-0000-0000-000000000001', 'gmail-msg-1', 'Dup', 'inbound') $$,
  'duplicate key value violates unique constraint "messages_connected_account_id_provider_message_id_key"',
  'messages: duplicate (connected_account_id, provider_message_id) is rejected'
);
select throws_ok(
  $$ insert into events (workspace_id, connected_account_id, provider_event_id, title, starts_at, ends_at)
     values ('e0000000-0000-0000-0000-000000000002', '21111111-2222-0000-0000-000000000001', 'gcal-evt-1', 'Dup', now(), now()) $$,
  'duplicate key value violates unique constraint "events_connected_account_id_provider_event_id_key"',
  'events: duplicate (connected_account_id, provider_event_id) is rejected'
);

select * from finish();
rollback;

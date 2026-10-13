begin;
select plan(30);

select has_table('public', 'scheduling_rules', 'scheduling_rules table exists');
select has_table('public', 'approval_settings', 'approval_settings table exists');
select has_table('public', 'scheduling_proposals', 'scheduling_proposals table exists');
select has_column('public', 'connected_accounts', 'scheduling_url', 'connected_accounts.scheduling_url exists');

-- Owner (O), Member B (MB) and Member C (MC) in one workspace. B's Google
-- account is Company-visible, so the Owner can read B's mail -- but a
-- scheduling proposal is still B's alone.
insert into auth.users (id, email) values
  ('5c000000-0000-0000-0000-00000000000f', 'owner-sched@example.com'),
  ('5c000000-0000-0000-0000-00000000000b', 'member-b-sched@example.com'),
  ('5c000000-0000-0000-0000-00000000000c', 'member-c-sched@example.com');
insert into companies (id, name) values ('5c000000-0000-0000-0000-000000000101', 'Co Sched');
insert into workspaces (id, company_id, name)
  values ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-000000000101', 'WS Sched');
insert into workspace_members (workspace_id, user_id, role) values
  ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000f', 'owner'),
  ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b', 'member'),
  ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000c', 'member');

insert into connected_accounts (id, workspace_id, owner_user_id, provider, account_type, visibility) values
  ('5c000000-0000-0000-0000-000000000201', '5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b', 'google', 'email', 'company'),
  ('5c000000-0000-0000-0000-000000000202', '5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b', 'google', 'calendar', 'private'),
  ('5c000000-0000-0000-0000-000000000203', '5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000c', 'google', 'calendar', 'private');

insert into messages (id, workspace_id, connected_account_id, provider_message_id, subject, direction) values
  ('5c000000-0000-0000-0000-000000000301', '5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-000000000201', 'gmail-sched-1', 'Can we meet?', 'inbound'),
  ('5c000000-0000-0000-0000-000000000302', '5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-000000000201', 'gmail-sched-2', 'Coffee?', 'inbound');

-- Rules and approval level: each user manages only their own.
set local role authenticated;
set local request.jwt.claims to '{"sub":"5c000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok(
  $$ insert into scheduling_rules (workspace_id, user_id, time_zone, booking_calendar_account_id)
     values ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b', 'Asia/Karachi', '5c000000-0000-0000-0000-000000000202') $$,
  'a member saves their own scheduling rules'
);
select throws_ok(
  $$ update scheduling_rules set booking_calendar_account_id = '5c000000-0000-0000-0000-000000000203'
     where user_id = '5c000000-0000-0000-0000-00000000000b' $$,
  '42501',
  null,
  'a member cannot book into someone else''s calendar'
);
select lives_ok(
  $$ insert into approval_settings (workspace_id, user_id, level)
     values ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b', 3) $$,
  'a member sets their own approval level'
);
select throws_ok(
  $$ insert into approval_settings (workspace_id, user_id, level)
     values ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000c', 4) $$,
  '42501',
  null,
  'a member cannot set someone else''s approval level'
);
select throws_ok(
  $$ update approval_settings set level = 5 where user_id = '5c000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'approval levels run 1 to 4'
);
reset role;

select is(
  (select level from approval_settings where user_id = '5c000000-0000-0000-0000-00000000000b')::int,
  3,
  'the approval level was saved'
);
select is(
  (select level from approval_settings where user_id = '5c000000-0000-0000-0000-00000000000c'),
  null,
  'no row exists for a user who never set one'
);
select is(
  (select column_default from information_schema.columns
   where table_name = 'approval_settings' and column_name = 'level'),
  '2',
  'the default approval level is 2'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"5c000000-0000-0000-0000-00000000000f","role":"authenticated"}';
select is((select count(*)::int from scheduling_rules), 0, 'the Owner cannot read a member''s scheduling rules');
select is((select count(*)::int from approval_settings), 0, 'the Owner cannot read a member''s approval level');

-- The Owner can read B's Company-visible mail, but cannot start a proposal from it.
select is((select count(*)::int from messages), 2, 'the Owner can read the Company-visible messages');
select throws_ok(
  $$ insert into scheduling_proposals (workspace_id, user_id, source_message_id, email_account_id, kind, draft_body)
     values ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000f',
             '5c000000-0000-0000-0000-000000000301', '5c000000-0000-0000-0000-000000000201', 'offer_times', 'Hi') $$,
  '42501',
  null,
  'no one can start a proposal from a teammate''s message, even a visible one'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"5c000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select lives_ok(
  $$ insert into scheduling_proposals (id, workspace_id, user_id, source_message_id, email_account_id, kind, draft_body, status)
     values ('5c000000-0000-0000-0000-000000000401', '5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b',
             '5c000000-0000-0000-0000-000000000301', '5c000000-0000-0000-0000-000000000201', 'offer_times', 'Hi', 'pending') $$,
  'a member starts a proposal from their own message'
);
select throws_ok(
  $$ insert into scheduling_proposals (workspace_id, user_id, source_message_id, email_account_id, kind, draft_body, status)
     values ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b',
             '5c000000-0000-0000-0000-000000000302', '5c000000-0000-0000-0000-000000000201', 'offer_times', 'Hi', 'booked') $$,
  '42501',
  null,
  'a proposal cannot be inserted already approved'
);
select throws_ok(
  $$ insert into scheduling_proposals (workspace_id, user_id, source_message_id, email_account_id, kind, draft_body)
     values ('5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b',
             '5c000000-0000-0000-0000-000000000302', '5c000000-0000-0000-0000-000000000202', 'offer_times', 'Hi') $$,
  '42501',
  null,
  'the reply must go from the account that received the message'
);
select is(
  (select status from scheduling_proposals where id = '5c000000-0000-0000-0000-000000000401'),
  'pending',
  'the proposal is pending'
);
update scheduling_proposals set status = 'booked' where id = '5c000000-0000-0000-0000-000000000401';
select is(
  (select status from scheduling_proposals where id = '5c000000-0000-0000-0000-000000000401'),
  'pending',
  'a direct update cannot approve a proposal'
);
reset role;

-- Claiming: only the proposal's own user, only from an allowed status, only once.
set local role authenticated;
set local request.jwt.claims to '{"sub":"5c000000-0000-0000-0000-00000000000f","role":"authenticated"}';
select is((select count(*)::int from scheduling_proposals), 0, 'the Owner cannot see a member''s proposal');
select throws_ok(
  $$ select claim_scheduling_proposal('5c000000-0000-0000-0000-000000000401', 'book') $$,
  'P0002',
  null,
  'another user cannot claim the proposal'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"5c000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$ select claim_scheduling_proposal('5c000000-0000-0000-0000-000000000401', 'send_link') $$,
  '22023',
  null,
  'an offer-times proposal cannot send a Calendly link'
);
select is(
  (select status from claim_scheduling_proposal('5c000000-0000-0000-0000-000000000401', 'book')),
  'executing',
  'the owner of the proposal claims it to book'
);
select throws_ok(
  $$ select claim_scheduling_proposal('5c000000-0000-0000-0000-000000000401', 'book') $$,
  '55000',
  null,
  'a proposal cannot be claimed twice'
);
reset role;


-- Reject: claimable from pending, ends in rejected.
update scheduling_proposals set status = 'pending' where id = '5c000000-0000-0000-0000-000000000401';
set local role authenticated;
set local request.jwt.claims to '{"sub":"5c000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(
  (select status from claim_scheduling_proposal('5c000000-0000-0000-0000-000000000401', 'reject')),
  'rejected',
  'rejecting a proposal ends it'
);
reset role;

-- A draft-only proposal can be dismissed, but never sent from Mimus.
insert into scheduling_proposals (id, workspace_id, user_id, source_message_id, email_account_id, kind, draft_body, status)
values ('5c000000-0000-0000-0000-000000000402', '5c000000-0000-0000-0000-000000000102', '5c000000-0000-0000-0000-00000000000b',
        '5c000000-0000-0000-0000-000000000302', '5c000000-0000-0000-0000-000000000201', 'offer_times', 'Hi', 'draft_only');
set local role authenticated;
set local request.jwt.claims to '{"sub":"5c000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$ select claim_scheduling_proposal('5c000000-0000-0000-0000-000000000402', 'send_offer') $$,
  '55000',
  null,
  'a draft-only proposal cannot be sent from Mimus'
);
select is(
  (select status from claim_scheduling_proposal('5c000000-0000-0000-0000-000000000402', 'reject')),
  'rejected',
  'a draft-only proposal can be dismissed'
);
reset role;

-- Disconnect purges messages; their proposals go with them.
delete from messages where id = '5c000000-0000-0000-0000-000000000301';
select is(
  (select count(*)::int from scheduling_proposals where source_message_id = '5c000000-0000-0000-0000-000000000301'),
  0,
  'deleting the source message deletes its proposals'
);

select * from finish();
rollback;

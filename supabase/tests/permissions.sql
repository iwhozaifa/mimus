begin;
select plan(8);

insert into auth.users (id, email) values
  ('44444444-0000-0000-0000-000000000001', 'owner@example.com'),
  ('44444444-0000-0000-0000-000000000002', 'manager@example.com'),
  ('44444444-0000-0000-0000-000000000003', 'member@example.com'),
  ('44444444-0000-0000-0000-000000000004', 'outsider@example.com');

insert into companies (id, name) values ('55555555-0000-0000-0000-000000000001', 'Co');
insert into workspaces (id, company_id, name)
  values ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 'WS');

insert into workspace_members (id, workspace_id, user_id, role) values
  ('77777777-0000-0000-0000-00000000000a', '66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'owner'),
  ('77777777-0000-0000-0000-00000000000b', '66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'manager'),
  ('77777777-0000-0000-0000-00000000000c', '66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000003', 'member');

select is(
  get_workspace_role('66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001'),
  'owner', 'owner role resolves correctly'
);
select is(
  get_workspace_role('66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004'),
  null, 'a non-member has no role in the workspace'
);

select is(can_manage_member('44444444-0000-0000-0000-000000000001', '77777777-0000-0000-0000-00000000000b'),
  true, 'owner can manage a manager');
select is(can_manage_member('44444444-0000-0000-0000-000000000001', '77777777-0000-0000-0000-00000000000c'),
  true, 'owner can manage a member');
select is(can_manage_member('44444444-0000-0000-0000-000000000001', '77777777-0000-0000-0000-00000000000a'),
  false, 'owner cannot manage an owner row');
select is(can_manage_member('44444444-0000-0000-0000-000000000002', '77777777-0000-0000-0000-00000000000c'),
  true, 'manager can manage a member');
select is(can_manage_member('44444444-0000-0000-0000-000000000002', '77777777-0000-0000-0000-00000000000b'),
  false, 'manager cannot manage another manager');
select is(can_manage_member('44444444-0000-0000-0000-000000000003', '77777777-0000-0000-0000-00000000000c'),
  false, 'member cannot manage anyone, even themself');

select * from finish();
rollback;

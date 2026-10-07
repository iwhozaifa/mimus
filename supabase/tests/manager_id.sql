begin;
select plan(4);

select has_column('public', 'workspace_members', 'manager_id', 'workspace_members has a manager_id column');

insert into auth.users (id, email) values
  ('88888888-0000-0000-0000-000000000001', 'owner2@example.com'),
  ('88888888-0000-0000-0000-000000000002', 'manager2@example.com'),
  ('88888888-0000-0000-0000-000000000003', 'other-ws-owner@example.com');

insert into companies (id, name) values ('99999999-0000-0000-0000-000000000001', 'Co2');
insert into workspaces (id, company_id, name) values
  ('aaaaaaaa-1111-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'WS2'),
  ('aaaaaaaa-1111-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', 'WS3');

insert into workspace_members (id, workspace_id, user_id, role) values
  ('bbbbbbbb-1111-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 'owner'),
  ('bbbbbbbb-1111-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000002', '88888888-0000-0000-0000-000000000003', 'owner');

-- Setting manager_id to a row in the SAME workspace succeeds.
select lives_ok(
  $$ insert into workspace_members (id, workspace_id, user_id, role, manager_id)
     values ('bbbbbbbb-1111-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001',
             '88888888-0000-0000-0000-000000000002', 'member', 'bbbbbbbb-1111-0000-0000-000000000001') $$,
  'manager_id referencing a row in the same workspace is accepted'
);

-- Setting manager_id to a row in a DIFFERENT workspace is rejected.
select throws_ok(
  $$ update workspace_members set manager_id = 'bbbbbbbb-1111-0000-0000-000000000003'
     where id = 'bbbbbbbb-1111-0000-0000-000000000002' $$,
  'manager_id must reference a member of the same workspace',
  'manager_id referencing a row in a different workspace is rejected'
);

-- Adding the column doesn't change the role-hierarchy management matrix.
select is(
  can_manage_member('88888888-0000-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000001'),
  false,
  'manager still cannot manage an owner row now that manager_id exists'
);

select * from finish();
rollback;

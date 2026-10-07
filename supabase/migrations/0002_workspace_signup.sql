-- Creates a profile + company + workspace + owner membership for a brand new
-- user, idempotently. SECURITY DEFINER because a user with no workspace yet
-- has no RLS-granted access to insert into any of these tables themselves.
create function create_default_workspace_for_user(p_user_id uuid, p_email text)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_workspace_id uuid;
  v_company_id uuid;
begin
  select workspace_id into v_workspace_id
  from workspace_members
  where user_id = p_user_id
  limit 1;

  if v_workspace_id is not null then
    return v_workspace_id;
  end if;

  insert into profiles (id, email)
  values (p_user_id, p_email)
  on conflict (id) do nothing;

  insert into companies (name) values (p_email || '''s company')
  returning id into v_company_id;

  insert into workspaces (company_id, name) values (v_company_id, 'My workspace')
  returning id into v_workspace_id;

  insert into workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner');

  return v_workspace_id;
end;
$$;

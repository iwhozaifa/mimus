-- Role lookup + the owner/manager/member management matrix. Both are
-- SECURITY DEFINER (workspace_members has no SELECT policies yet) and
-- revoked from anon/authenticated -- these are internal building blocks the
-- permission engine calls via a service-role client, not public RPCs
-- arbitrary users should invoke with someone else's ids.

create function get_workspace_role(p_workspace_id uuid, p_user_id uuid)
returns text
security definer
set search_path = public
stable
language sql
as $$
  select role from workspace_members
  where workspace_id = p_workspace_id and user_id = p_user_id and status = 'active'
  limit 1;
$$;

revoke all on function get_workspace_role(uuid, uuid) from public;

-- Owner manages manager/member rows (not another owner row). Manager
-- manages member rows only. Member manages no one.
create function can_manage_member(p_actor_user_id uuid, p_target_membership_id uuid)
returns boolean
security definer
set search_path = public
stable
language plpgsql
as $$
declare
  v_actor_role text;
  v_target_role text;
  v_workspace_id uuid;
begin
  select workspace_id, role into v_workspace_id, v_target_role
  from workspace_members
  where id = p_target_membership_id;

  if v_workspace_id is null then
    return false;
  end if;

  v_actor_role := get_workspace_role(v_workspace_id, p_actor_user_id);

  return case v_actor_role
    when 'owner' then v_target_role <> 'owner'
    when 'manager' then v_target_role = 'member'
    else false
  end;
end;
$$;

revoke all on function can_manage_member(uuid, uuid) from public;

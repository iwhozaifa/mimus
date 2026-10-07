-- Closes the remaining visibility/management gaps left after 0006 (self-select
-- only on workspace_members) and 0001 (profiles enabled with zero policies
-- ever added): teammates can now see each other, owners/managers can manage
-- member rows through RLS itself (not just app-level checks), and a user can
-- read their own profile plus any workspace peer's. workspaces' own SELECT
-- policy was already added in 0010; not touched here.

-- True if both users have an active membership in the same workspace.
-- Backs the profiles peer-visibility policy below.
create function shares_workspace_with(p_uid uuid, p_other_uid uuid)
returns boolean
security definer
set search_path = public
stable
language sql
as $$
  select exists (
    select 1
    from workspace_members a
    join workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = p_uid and a.status = 'active'
      and b.user_id = p_other_uid and b.status = 'active'
  );
$$;

revoke all on function shares_workspace_with(uuid, uuid) from public;

-- Peer visibility: any active member of a workspace can see every row in it,
-- not just their own. Additive alongside 0006's self-select policy (Postgres
-- ORs permissive policies together) -- removing it would be unnecessary
-- churn. get_workspace_role is SECURITY DEFINER, so this does not recurse
-- through workspace_members' own RLS.
create policy select_workspace_members_peers on public.workspace_members
  for select using (get_workspace_role(workspace_id, auth.uid()) is not null);

-- Management writes. USING is evaluated against the row as it stands before
-- the update (can_manage_member reads the target's current role, which is
-- exactly what "is this actor allowed to touch this row at all" should check).
-- WITH CHECK is evaluated against the resulting row and uses two literal
-- guards on the bare `role` column rather than calling can_manage_member
-- again: a same-statement SELECT from workspace_members (as that function
-- does internally) would not see this row's own pending update, so it
-- couldn't validate the *new* role anyway. No DELETE policy -- removal is a
-- soft `status = 'removed'` update, not a row delete.
create policy update_workspace_members_managed on public.workspace_members
  for update
  using (can_manage_member(auth.uid(), id))
  with check (
    role <> 'owner'
    and (get_workspace_role(workspace_id, auth.uid()) <> 'manager' or role = 'member')
  );

-- profiles: visible to yourself, or to anyone who shares a workspace with
-- you. No write policy -- nothing writes here except 0002's signup function.
create policy select_profiles_self_and_peers on public.profiles
  for select using (
    id = auth.uid() or shares_workspace_with(auth.uid(), id)
  );

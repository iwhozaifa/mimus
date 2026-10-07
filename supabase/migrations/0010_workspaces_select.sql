-- workspaces has had RLS enabled with zero policies since 0001 -- nobody
-- could read even their own workspace's name. Scoped minimally to SELECT
-- for active members only; writes stay restricted to the provisioning
-- function. (The broader workspace_members peer-visibility / profiles
-- policies are a separate follow-up migration, not this one.)

create policy select_workspaces_active_members on public.workspaces
  for select using (
    exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = workspaces.id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

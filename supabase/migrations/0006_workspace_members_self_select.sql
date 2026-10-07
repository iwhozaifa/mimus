-- A signed-in user needs to discover their own workspace(s) through their
-- own RLS-respecting session (e.g. to know which workspace to act in) --
-- this was the one gap left from the deny-by-default migration. Scoped
-- strictly to their own row; no cross-member visibility granted here.
create policy select_own_membership on public.workspace_members
  for select using (user_id = auth.uid());

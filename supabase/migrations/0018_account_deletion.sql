-- Account deletion (Settings → Account) deletes the user's auth.users row
-- and lets cascades remove their profile, memberships and connected
-- accounts. Three foreign keys pointed at that user (or at their
-- membership) with no delete rule, so any user who had asked Mimus a
-- question, sent an invite or managed a teammate couldn't be deleted at
-- all. Each now keeps the other side's row and clears the link:
--
-- * agent_logs.user_id: the workspace keeps its AI usage/cost history,
--   no longer attributed to the deleted person (the Privacy Policy's
--   retention section promises exactly this).
-- * invites.invited_by: the invite record stays for the workspace's Owners.
-- * workspace_members.manager_id: their reports stay in the workspace,
--   just without a manager until an Owner assigns one.

alter table public.agent_logs alter column user_id drop not null;
alter table public.agent_logs drop constraint agent_logs_user_id_fkey;
alter table public.agent_logs
  add constraint agent_logs_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

alter table public.invites drop constraint invites_invited_by_fkey;
alter table public.invites
  add constraint invites_invited_by_fkey
  foreign key (invited_by) references public.workspace_members (id) on delete set null;

alter table public.workspace_members drop constraint workspace_members_manager_id_fkey;
alter table public.workspace_members
  add constraint workspace_members_manager_id_fkey
  foreign key (manager_id) references public.workspace_members (id) on delete set null;

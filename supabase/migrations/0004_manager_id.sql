-- Reporting-line field: who a member's "team" (for Team-visibility purposes,
-- see the implementation plan) is scoped to. Self-referencing, nullable --
-- not every member has a manager on record yet. A trigger enforces that the
-- referenced row belongs to the same workspace, since a plain FK can't
-- express that cross-column constraint.

alter table public.workspace_members
  add column manager_id uuid references public.workspace_members (id);

create function enforce_manager_same_workspace()
returns trigger
language plpgsql
as $$
begin
  if new.manager_id is not null and not exists (
    select 1 from workspace_members
    where id = new.manager_id and workspace_id = new.workspace_id
  ) then
    raise exception 'manager_id must reference a member of the same workspace';
  end if;
  return new;
end;
$$;

create trigger workspace_members_manager_same_workspace
  before insert or update of manager_id, workspace_id on public.workspace_members
  for each row
  execute function enforce_manager_same_workspace();

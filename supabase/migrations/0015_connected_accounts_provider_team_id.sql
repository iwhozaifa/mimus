-- Slack's Events API delivers one notification per Slack *workspace*
-- (team), not per connected_accounts row, so ingesting a notification
-- needs a way to find every Mimus member who connected Slack from that
-- same Slack workspace. Named generically (not slack_team_id) since any
-- future provider with its own workspace/tenant concept distinct from
-- external_account_id (which is per-user, not per-workspace) could reuse
-- it the same way.

alter table public.connected_accounts
  add column provider_team_id text;

create index on public.connected_accounts (provider, provider_team_id);

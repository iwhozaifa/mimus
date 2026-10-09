-- One row per Slack workspace (team) that has installed the Mimus app.
-- Events API ingestion needs a bot token for the team a notification came
-- from to resolve channel membership (see
-- src/server/connectors/slack/events.ts). A single app-wide bot token only
-- covers one Slack workspace, so each install's bot token is captured
-- during the member's own OAuth click and stored here, encrypted with the
-- same token vault as connected_account_secrets.
--
-- Keyed by team_id, not by Mimus workspace: one Slack workspace has one
-- bot token no matter how many Mimus members or tenants connect it.
create table public.slack_installations (
  team_id text primary key,
  team_name text,
  encrypted_bot_token bytea not null,
  key_version int not null,
  bot_user_id text,
  installed_by_workspace_id uuid references public.workspaces (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Same posture as connected_account_secrets: no RLS policies at all and
-- every privilege revoked from end-user roles, so only the service role
-- can read or write bot tokens.
alter table public.slack_installations enable row level security;
revoke all on public.slack_installations from authenticated, anon;

-- The Slack workspace's display name and domain (e.g. acme.slack.com),
-- shown on the connections page so a member with several Slack
-- workspaces connected can tell them apart.
alter table public.connected_accounts
  add column provider_team_name text,
  add column provider_team_domain text;

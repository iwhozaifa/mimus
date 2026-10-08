-- Generic sync-state columns for connectors, usable by either Google or
-- Microsoft (Milestone 2): sync_cursor is a provider-opaque incremental
-- sync token (Gmail historyId, Graph delta token); the watch_* columns
-- back the push-notification renewal cron (Gmail watch() expires in <=7
-- days, Graph subscriptions in <=3 days -- both renewed on a schedule
-- against watch_expires_at).

alter table public.connected_accounts
  add column sync_cursor text,
  add column watch_resource_id text,
  add column watch_channel_id text,
  add column watch_expires_at timestamptz;

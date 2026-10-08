-- Enables pg_cron so later migrations can schedule Edge Function calls
-- (Milestone 2's Gmail watch / Graph subscription renewal jobs are the
-- first consumers of this). pg_cron installs its own `cron` schema;
-- `postgres` already has the privileges it needs by default locally and
-- on Supabase Cloud.
create extension if not exists pg_cron;

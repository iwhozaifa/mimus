begin;
select plan(1);
select has_extension('pg_cron', 'pg_cron extension is enabled');
select * from finish();
rollback;

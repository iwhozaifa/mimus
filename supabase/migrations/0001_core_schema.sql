-- Core identity/org schema: companies, profiles, workspaces, workspace_members, invites.
-- RLS is enabled with no policies yet (deny-by-default) -- visibility policies
-- are added in a later migration once the role model exists (see §1.5).

create extension if not exists pgtap;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'member')),
  invited_by uuid references public.workspace_members (id),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on public.workspaces (company_id);
create index on public.workspace_members (user_id);
create index on public.invites (workspace_id);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invites enable row level security;

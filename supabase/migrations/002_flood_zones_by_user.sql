-- OPTIONAL — not used by the current app. All admins edit one shared row in `flood_zones` (see 001).
-- This table was for per-user zone layouts; you can skip this migration entirely.
-- If you already ran it, it is harmless to leave in place.
--
-- Legacy description: per-user zone sets (deprecated for this codebase).
-- Run in Supabase → SQL Editor after 001_flood_zones.sql.
-- Requires Supabase Auth (Authentication → Providers → Email enabled).

create table if not exists public.flood_zones_by_user (
  user_id uuid not null references auth.users(id) on delete cascade,
  map_id text not null default 'default',
  zones jsonb not null default '{"30":[],"60":[],"100":[],"0.5":[],"1":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, map_id)
);

create index if not exists flood_zones_by_user_updated_at
  on public.flood_zones_by_user (updated_at desc);

alter table public.flood_zones_by_user enable row level security;

-- Users can only read/write their own rows
create policy "flood_zones_by_user_select"
  on public.flood_zones_by_user for select
  using (auth.uid() = user_id);

create policy "flood_zones_by_user_insert"
  on public.flood_zones_by_user for insert
  with check (auth.uid() = user_id);

create policy "flood_zones_by_user_update"
  on public.flood_zones_by_user for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "flood_zones_by_user_delete"
  on public.flood_zones_by_user for delete
  using (auth.uid() = user_id);

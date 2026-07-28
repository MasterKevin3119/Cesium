-- Shared zone layout: one row per map_id in `flood_zones` (not per user).
-- Any signed-in flood admin can save; everyone (including anonymous) can read.
-- Run this first, in Supabase SQL Editor, before any other migration in this folder.

create table if not exists public.flood_zones (
  map_id text not null primary key,
  zones jsonb not null default '{"30":[],"60":[],"100":[],"0.5":[],"1":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists flood_zones_updated_at on public.flood_zones (updated_at desc);

alter table public.flood_zones enable row level security;

-- Public read (viewer loads zones without sign-in)
create policy "flood_zones_select"
  on public.flood_zones for select
  using (true);

-- Writes: authenticated users with flood_is_admin in JWT user_metadata or app_metadata (same as app checks)
create policy "flood_zones_insert"
  on public.flood_zones for insert
  with check (
    auth.role() = 'authenticated'
    and (
      (auth.jwt() -> 'user_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
      or (auth.jwt() -> 'app_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
    )
  );

create policy "flood_zones_update"
  on public.flood_zones for update
  using (
    auth.role() = 'authenticated'
    and (
      (auth.jwt() -> 'user_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
      or (auth.jwt() -> 'app_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      (auth.jwt() -> 'user_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
      or (auth.jwt() -> 'app_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
    )
  );

create policy "flood_zones_delete"
  on public.flood_zones for delete
  using (
    auth.role() = 'authenticated'
    and (
      (auth.jwt() -> 'user_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
      or (auth.jwt() -> 'app_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
    )
  );

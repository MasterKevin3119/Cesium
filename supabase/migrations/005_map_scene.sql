-- Shared 3D scene (houses as boxes, roads as corridors) per map_id — same pattern as flood_zones.
-- Run in Supabase SQL Editor after your project has auth enabled.

create table if not exists public.map_scene (
  map_id text not null primary key,
  scene jsonb not null default '{"houses":[],"roads":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists map_scene_updated_at on public.map_scene (updated_at desc);

alter table public.map_scene enable row level security;

-- Public read (viewer loads without sign-in)
create policy "map_scene_select"
  on public.map_scene for select
  using (true);

-- Writes: authenticated users with flood_is_admin in JWT user_metadata or app_metadata (same as app checks)
create policy "map_scene_insert"
  on public.map_scene for insert
  with check (
    auth.role() = 'authenticated'
    and (
      (auth.jwt() -> 'user_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
      or (auth.jwt() -> 'app_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
    )
  );

create policy "map_scene_update"
  on public.map_scene for update
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

create policy "map_scene_delete"
  on public.map_scene for delete
  using (
    auth.role() = 'authenticated'
    and (
      (auth.jwt() -> 'user_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
      or (auth.jwt() -> 'app_metadata' ->> 'flood_is_admin') in ('true', 't', '1')
    )
  );

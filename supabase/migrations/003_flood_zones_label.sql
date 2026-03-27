-- Optional human-readable name for published scenario rows in flood_zones (map_id like pub_*).
-- Safe to run even if you created flood_zones manually without every column from 001.

alter table if exists public.flood_zones
  add column if not exists label text;

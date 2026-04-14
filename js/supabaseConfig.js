/**
 * Supabase: one shared zone map in `flood_zones` (see FLOOD_MAP_ID). Flood admins may POST updates;
 * optional `map_scene` holds admin-placed houses/roads (migration 005). Signed-in users use auth mainly for mission answers (`mission_first_answers`).
 * 1. Run supabase/migrations/001_flood_zones.sql (and 004_mission_first_answers.sql if you use missions).
 * 2. Paste Project URL + anon key from Supabase → Settings → API.
 * Leave URL empty to use localStorage-only zones (no cross-device sync).
 */
(function () {
  'use strict';
  window.FLOOD_SUPABASE_URL = 'https://pwfffmbddbgvtgkzdxwl.supabase.co'; // e.g. 'https://abcdefgh.supabase.co'
  window.FLOOD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3ZmZmbWJkZGJndnRna3pkeHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTA0NzksImV4cCI6MjA4OTM4NjQ3OX0.PD2DGOQx0-0kaD_PutKSRcDHwVK8t7rxm5RX7Rh-KwY';
  window.FLOOD_MAP_ID = 'default';
})();

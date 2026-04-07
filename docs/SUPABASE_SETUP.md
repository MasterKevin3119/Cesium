# Supabase setup

## 1. Create a project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Wait for the database to finish provisioning.

## 2. Create the tables

1. Open **SQL Editor** → **New query**.
2. Paste and run **`supabase/migrations/001_flood_zones.sql`** — **one shared zone layout** for the map (row keyed by `map_id`, usually `default`).
3. (Optional) Skip **`002_flood_zones_by_user.sql`** — the app does **not** use per-user zone rows; all flood admins edit the same `flood_zones` row.
4. (Optional) Run **`003_flood_zones_label.sql`** only if you maintain extra `flood_zones` rows with labels (not required for the default viewer).
5. (Optional) Run **`supabase/migrations/004_mission_first_answers.sql`** so each signed-in user’s **first** answer per mission question is stored (retries are not saved again).

## 3. Enable Email auth

1. **Authentication** → **Providers** → **Email** → enable and save.
2. (Optional) Under Email auth, turn off “Confirm email” for quicker testing.

## 4. API keys

1. **Project Settings** → **API**.
2. Copy **Project URL** and **anon public** key.

## 5. Configure the app

Edit **`js/supabaseConfig.js`**:

```js
window.FLOOD_SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
window.FLOOD_SUPABASE_ANON_KEY = 'eyJ...';
window.FLOOD_MAP_ID = 'default';
```

Reload the app.

## Behaviour

### Flood zones (shared)

- **Everyone** (signed in or not) **reads** the same zones from **`flood_zones`** for `FLOOD_MAP_ID` (e.g. `default`).
- **Only flood admins** can **write** zones to Supabase (the app sends POST only when `flood_is_admin` is set on the user). Multiple admins are different people (PICs) editing the **same** layout; the last save wins for that row.
- The viewer **re-pulls** periodically and when the tab becomes visible so admins see updates from others without a full reload.

### Accounts

- **Normal users:** sign in so mission flows can store answers (e.g. **`mission_first_answers`**) — not a separate zone layout per user.
- **Admins:** sign up with the **admin code** (`3119` in `js/authUi.js`) so `flood_is_admin` is set in user metadata. They get the zone editor in the simulator.

**Login in the app:** username (letters, numbers, `_`, `-`, min 2 chars) and **4-digit PIN**. This maps to a Supabase email `name@flood-app.local` and password `00` + PIN.

**Existing users** without the admin flag: add `flood_is_admin: true` in **User metadata** (Supabase Dashboard → Authentication → user), or create a new account with the admin code.

## Security

- **`flood_zones`:** default demo RLS often allows anon read/write; for production, restrict **insert/update** to admins (service role, Edge Function, or policies on `auth.jwt()` claims).
- **`mission_first_answers`:** RLS allows each user to **insert** and **select** only their own rows.

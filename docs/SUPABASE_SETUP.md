# Supabase setup for flood zones

## 1. Create a project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Wait for the database to finish provisioning.

## 2. Create the tables

1. Open **SQL Editor** → **New query**.
2. Paste and run **`supabase/migrations/001_flood_zones.sql`** (shared zones).
3. New query again, paste and run **`supabase/migrations/002_flood_zones_by_user.sql`** (per-admin zones).

## 3. Enable Email auth (for per-admin zones)

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

Reload the app. You should see **Admin login** in the Master Control panel.

## Behaviour

- **Not logged in:** Zones use the shared **`flood_zones`** table. Anyone can edit.
- **Logged in:** Zones use **`flood_zones_by_user`**. Each admin has their own zone set; Save/load is per account.

**Login in the app:** use a **username** (letters, numbers, `_`, `-`, min 2 chars) and a **4-digit PIN**. Behind the scenes this becomes a Supabase email like `yourname@flood-app.local` and a 6-character password (`00` + your PIN) so it works with Supabase’s minimum password length. Sign up once, then Admin → Save for your zones. Another username = another zone set.

## Security

- **`flood_zones`**: RLS in 001 allows public read/write (demo).
- **`flood_zones_by_user`**: RLS in 002 allows only the authenticated user to read/write their own rows.

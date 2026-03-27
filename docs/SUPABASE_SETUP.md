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

- **Not logged in:** Zones load/save against the shared **`flood_zones`** table. The **Admin** toolbar button is visible so admins can sign in; the **zone editor** opens only for **admin accounts** (see admin code below).
- **Logged in:** Zones use **`flood_zones_by_user`**. Each account has its own zone set. **Admin → Save** applies only when the account is an **admin** editor account.

**Login in the app:** use a **username** (letters, numbers, `_`, `-`, min 2 chars) and a **4-digit PIN**. Behind the scenes this becomes a Supabase email like `yourname@flood-app.local` and a 6-character password (`00` + your PIN) so it works with Supabase’s minimum password length. **Sign up or log in**, then click **Admin** to edit zones and **Save**. Another username = another zone set.

**Admin code (required to edit zones):** On **sign up only**, the **Admin code** field must be set to the app’s configured code (`3119` in `js/app.js`) to store `flood_is_admin` in **user metadata**. Only those accounts see the **Admin** button and can open the grid editor. Other signed-in users do not see **Admin** and cannot edit zones (app-side only; use RLS/Edge Functions for stronger guarantees).

**Existing users** created before the admin flag: add `flood_is_admin: true` under **User metadata** in the Supabase Dashboard (Authentication → user), or create a new account with the admin code.

## Published scenarios (shared zone layouts)

Run **`supabase/migrations/003_flood_zones_label.sql`** if you want an optional **`label`** column on **`flood_zones`** (nicer names in the viewer). The app works without it.

In **Master Control → Zone layout**:

- **Public · default map** — row `map_id = default` in **`flood_zones`**.
- **My saved zones** — your row in **`flood_zones_by_user`** (when signed in).
- **Scenario · …** — rows whose **`map_id`** starts with **`pub_`** (published snapshots).

**Flood admins** can use **Publish current layout as scenario…** to copy the **current in-memory zones** (what you last loaded or edited) into **`flood_zones`** as `pub_<slug>` with an optional **label**.

Deep link: **`viewer.html?lat=…&lon=…&layout=pub_your-slug`**. **Copy view URL** includes **`layout`** when a non-default source is selected.

## Security

- **`flood_zones`**: RLS in 001 allows public read/write (demo).
- **`flood_zones_by_user`**: RLS in 002 allows only the authenticated user to read/write their own rows.

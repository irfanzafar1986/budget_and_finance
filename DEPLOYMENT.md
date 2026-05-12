# Web App Refactor & Deployment Plan — v2

## Context

**The plan has changed.** v1 was originally an Electron desktop app (installer download per user, data only on local machine). Going forward we're shipping a **hosted web app with user accounts** instead — users sign up at a URL and access their budget data from any device.

**This is a significant refactor**, not just a deployment change. Roughly 70–80% of the React code (pages, components, domain logic) is preserved; the data layer and shell are replaced.

**Free stack (total cost: $0):**

| Need | Service | Free tier limit |
|---|---|---|
| Frontend hosting | **Vercel** (Hobby) | Unlimited bandwidth, free SSL, free `.vercel.app` subdomain, optional custom domain |
| Database | **Supabase** (Free) | 500 MB Postgres, 50,000 monthly active users |
| Auth | **Supabase Auth** (included) | Email/password, password reset, session management |
| User data isolation | **Supabase Row Level Security** (included) | Enforced at the database — each user only ever reads/writes their own rows |

For an audience of <1000 users this stays comfortably inside free limits indefinitely.

---

## Architecture: before → after

**Before (Electron desktop, v1):**
```
Electron window
  └─ React app
      └─ sql.js (WASM SQLite, in-memory)
          └─ IndexedDB (browser persistence, debounced commits)
```
Single user. Data on one machine. Installer-based distribution.

**After (web app, v2):**
```
Browser ──HTTPS──> Vercel (static React SPA)
                      │
                      └─ Supabase JS Client
                            ├─ /auth/v1   → session, signup, login, JWT
                            └─ /rest/v1   → Postgres (with RLS)
```
Multi-user. Cloud database. URL-based access from any device.

---

## What's preserved vs. what changes

| Layer | Status | Notes |
|---|---|---|
| **React components** (`src/components/*`) | ✅ Keep as-is | UI primitives don't care about the data source |
| **Pages** (`src/pages/*`) | ✅ Keep as-is (mostly) | Same forms, same flows — just async repo calls |
| **Domain logic** (`src/domain/*`, `src/utils/*`) | ✅ Keep as-is | Pure functions: money math, date helpers, expense calcs |
| **Routing** (`src/routes.tsx`) | 🟡 Small change | Add `/login` + `/signup`, wrap app routes in `<RequireAuth>` |
| **App state** (`src/state/AppContext.tsx`) | 🟡 Update | Add session/auth state alongside existing app state |
| **Database schema** (`src/db/schema.sql`) | 🔁 Rewrite for Postgres | Same tables/relationships, Postgres types, RLS policies added |
| **DB connection** (`src/db/connection.ts`) | 🔁 Replace | sql.js gone → Supabase client singleton |
| **DB repos** (`src/db/repos/*.ts`, 9 files) | 🔁 Rewrite | Same function signatures, calls go to Supabase instead of raw SQL |
| **Electron shell** (`electron/main.cjs`) | ❌ Delete | No longer used |
| **Electron-builder config** (`package.json` `build` block) | ❌ Delete | Plus `dist:*` scripts, mac/linux/win targets |
| **GitHub Actions release workflow** | ❌ Delete | Was for cross-platform installers |
| **`README.md`** | 🔁 Rewrite | New install/usage story (it's a URL, not a download) |

---

## Implementation phases

### Phase 0 — Cleanup obsolete v1 artifacts (~10 min) — I'll do this

Delete what's now dead:
- `electron/` folder (the Electron main process)
- `.github/workflows/release.yml` (cross-platform installer CI)
- `dist:*` scripts and `build.*` block in `package.json`
- Devs deps: `electron`, `electron-builder`
- The old `DEPLOYMENT.md` content (this file replaces it)

### Phase 1 — Supabase project setup (~10 min) — **needs you**

You'll need to do this part interactively in your browser (I can't sign in for you):

1. Go to **https://supabase.com** → Sign up (free, no card required — GitHub or email login).
2. Create a new project. Pick a name (`budget-finance-app`), pick a strong DB password (save it somewhere safe), pick a region near you.
3. Once it's provisioned (~2 min), grab **two values** from Project Settings → API:
   - `Project URL` (looks like `https://xxxxxx.supabase.co`)
   - `anon public` key (looks like `eyJhbGciOi...`)
4. Share both values with me — these go into Vite env vars and Vercel env vars later. The `anon` key is safe to expose (RLS protects the data); the `service_role` key is NOT — never share that one.

### Phase 2 — Schema migration (~20 min) — I'll prepare, you'll run

I'll convert `src/db/schema.sql` from SQLite to Postgres syntax and add Row Level Security. The key changes:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`
- `TEXT` for dates → `DATE` / `TIMESTAMPTZ`
- `INTEGER` for booleans (0/1) → `BOOLEAN`
- Add `auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE` on `user_profile` — the bridge between Supabase Auth and our schema
- Add **RLS policies** on every table — they all chain through `user_profile_id` already, so the policy is just: "row is visible iff its `user_profile_id` belongs to the currently authenticated user." Same pattern for INSERT/UPDATE/DELETE.

You'll paste the resulting SQL into Supabase's SQL Editor and click Run.

### Phase 3 — Replace data layer (~3–4 hours) — I'll do this

- Add dep: `@supabase/supabase-js`
- Remove deps: `sql.js`, `@types/sql.js`
- Create `src/lib/supabase.ts` — singleton client, reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` from env
- Delete `src/db/connection.ts`, `src/db/schema.sql` (old), the schema-as-string import
- Rewrite each of the 9 repos in `src/db/repos/*.ts` — same exported function signatures (so pages don't change), but bodies call `supabase.from('table').select()/.insert()/.update()/.delete()` instead of raw SQL
- Pages become `async`-aware where they weren't already (most already are, since sql.js init was async)
- Drop the debounced-commit / `withTransaction` / `subscribe` plumbing — Supabase handles all of it server-side

### Phase 4 — Auth UI (~2–3 hours) — I'll do this

- `src/pages/Signup.tsx` — email, password, confirm. Calls `supabase.auth.signUp()`. On success, creates a `user_profile` row.
- `src/pages/Login.tsx` — email, password. Calls `supabase.auth.signInWithPassword()`.
- `src/lib/auth.tsx` — `AuthProvider` + `useAuth()` hook. Subscribes to `supabase.auth.onAuthStateChange`, exposes `session`, `user`, `signOut()`.
- `src/components/RequireAuth.tsx` — route wrapper. If no session, `<Navigate to="/login" />`.
- Update `src/routes.tsx` — public routes (`/login`, `/signup`) + protected routes (everything else).
- Add a sign-out button somewhere in `Nav.tsx`.
- Password reset flow can land in v2.1 — not blocking launch.

### Phase 5 — Strip Electron + new README (~30 min) — I'll do this

- Delete `electron/` folder, `.github/workflows/release.yml`
- Strip `dist:*` scripts and `build.*` config from `package.json`
- Remove Electron devDeps
- Rewrite `README.md` for the web context: "Live at <url>", how to sign up, what it does, how to run locally for development

### Phase 6 — Deploy to Vercel (~15 min) — **needs you for the GitHub + Vercel steps**

1. **GitHub** — you create a public repo and we push the code (same as the original v1 plan).
2. **Vercel** — sign up at vercel.com (free, GitHub login is easiest), click "Add New Project", import the GitHub repo. Vercel auto-detects Vite/React.
3. In Vercel project settings → Environment Variables, add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click Deploy. ~2 minutes later you have a live URL like `https://budget-finance-app.vercel.app`.
5. Every future `git push` to `main` auto-deploys.

---

## Files modified / created — full inventory

| File | Action |
|---|---|
| `src/lib/supabase.ts` | **NEW** — client singleton |
| `src/lib/auth.tsx` | **NEW** — AuthProvider + useAuth hook |
| `src/pages/Login.tsx` | **NEW** |
| `src/pages/Signup.tsx` | **NEW** |
| `src/components/RequireAuth.tsx` | **NEW** — protected-route wrapper |
| `src/db/schema.sql` | **REWRITE** — Postgres + RLS (then runs in Supabase, not bundled) |
| `src/db/connection.ts` | **DELETE** |
| `src/db/repos/userProfile.ts` | **REWRITE** |
| `src/db/repos/budgetYear.ts` | **REWRITE** |
| `src/db/repos/category.ts` | **REWRITE** |
| `src/db/repos/asset.ts` | **REWRITE** |
| `src/db/repos/period.ts` | **REWRITE** |
| `src/db/repos/snapshot.ts` | **REWRITE** |
| `src/db/repos/income.ts` | **REWRITE** |
| `src/db/repos/assignment.ts` | **REWRITE** |
| `src/state/AppContext.tsx` | **UPDATE** — integrate auth state |
| `src/routes.tsx` | **UPDATE** — add public + protected routes |
| `src/components/Nav.tsx` | **UPDATE** — show user email + logout |
| `package.json` | **UPDATE** — remove electron/sql.js/build block; add @supabase/supabase-js |
| `electron/main.cjs` | **DELETE** |
| `.github/workflows/release.yml` | **DELETE** |
| `README.md` | **REWRITE** for web context |
| `.env.example` | **NEW** — documents required `VITE_SUPABASE_*` vars |
| `LICENSE` | ✅ Keep (MIT still applies) |
| `index.html`, `vite.config.ts`, `tsconfig.json` | ✅ No changes needed |

---

## How user emails, accounts, and passwords are handled

**Short version: your app never stores or sees passwords. Supabase does — securely.**

| Data | Where it lives | Who can see it |
|---|---|---|
| Email | Supabase's managed `auth.users` table | You (project owner, via dashboard); never other users |
| Password | **Never stored as plaintext** — only a one-way bcrypt hash | Nobody. Hashes cannot be reversed |
| Session token (JWT) | User's browser localStorage | Only that user; signed by Supabase, expires |

**Signup flow:**
1. User submits email + password to your React form.
2. Your code calls `supabase.auth.signUp({ email, password })`.
3. The Supabase SDK sends both **directly** to Supabase over HTTPS. Your app code never logs, stores, or persists the password — it leaves the function the moment that call returns.
4. Supabase bcrypt-hashes the password server-side, writes `email` + `password_hash` to `auth.users`.
5. Supabase returns a session JWT, which the SDK stores in the browser.
6. Your app sees a `user.id` (UUID) + `user.email` — nothing more.

**Inherited security properties (no work needed from you):**
- Passwords bcrypt-hashed before touching disk
- HTTPS enforced end-to-end (Vercel + Supabase)
- Sessions auto-expire and are revocable
- Email confirmation flow (toggleable)
- Built-in "forgot password" email magic-link flow
- Brute-force / rate-limiting at Supabase's edge
- Optional 2FA (toggle on later if desired)
- Row Level Security at the DB layer — a hijacked session still can't read other users' data
- GDPR-compliant infrastructure (Supabase is data processor; you are the data controller)

**What you, as project owner, CAN see in the Supabase dashboard:**
- The list of registered emails and last sign-in times
- The ability to manually delete, ban, or password-reset users

**What nobody can ever see — by design:**
- Plaintext passwords (they cease to exist the moment `signUp()` returns)
- Another user's budget data while logged in as someone else (blocked by RLS at the DB layer)

This is the same auth model used by Notion, Vercel itself, Linear, and most modern SaaS apps — battle-tested and audited.

---

## Caveats & known constraints

1. **Free Supabase projects pause after 1 week of zero activity.** The first request after a pause auto-wakes them (~30s cold start). For an active app this never matters. If it becomes annoying you can ping the project periodically (e.g. a free cron-ping service) — still free.
2. **Email confirmation** — by default Supabase sends a confirmation email on signup. For v1 of v2 we can either: (a) require email confirmation (safer, slightly more friction), or (b) disable it in project settings (faster onboarding). Recommend (a). Can toggle later.
3. **No rate limiting on signups** at the app layer — Supabase's built-in limits are enough for a hobby project. If you ever get botted, Supabase has a CAPTCHA toggle.
4. **One Postgres project** holds all users' data on free tier. RLS keeps it watertight, but it's a single shared DB. Standard for a small SaaS; not a concern at your scale.
5. **No offline mode** — this is the explicit tradeoff vs. the Electron version. Users need internet. v2.1 could add an offline cache, but it's out of scope for v2.

---

## Outstanding items (need from you)

Before I can start Phases 3–5 (the code refactor):

1. ✅ **Plan approval** — do you want me to proceed with this plan as written?
2. **Supabase project URL** + **anon key** (from Phase 1 — you set up the Supabase project, then send me both values)
3. **Auth UX preference** — email confirmation required on signup, or skip? (Recommended: required.)

Before Phase 6 (deploy):

4. **GitHub username** + repo name (for the push + Vercel import)
5. **Vercel account** — sign up at vercel.com when we're ready to deploy (you do this in browser; 2 minutes)

---

## Verification

After Phase 6 is live, smoke-test:

1. **Signup flow** — visit URL, sign up with email A, confirm via email link if enabled, log in.
2. **Setup flow** — go through the existing Setup wizard, create categories + assets + income sources.
3. **Data persistence** — add a balance snapshot, refresh the browser, data should still be there (now coming from Supabase, not IndexedDB).
4. **Cross-device** — log in on a phone or another browser with the same email; data should appear.
5. **Isolation** — open an incognito window, sign up with email B, confirm that email B sees zero data from email A. **This is the test that validates RLS is working** — non-negotiable.
6. **Logout + login** — sign out, sign back in, session restores.
7. **Page-by-page** — Dashboard, UpdateBalances, Income, Expenses, PeriodAssign, Settings — every page loads with no errors and reflects the user's data correctly.

---

## Realistic timeline

- Phase 0 (cleanup): 10 min
- Phase 1 (Supabase setup): 10 min — **your time**
- Phase 2 (schema migration SQL): 20 min — I prep, you paste/run
- Phase 3 (data layer rewrite): 3–4 hours of focused work
- Phase 4 (auth UI): 2–3 hours
- Phase 5 (Electron strip + README): 30 min
- Phase 6 (deploy to Vercel): 15 min — mostly your time

**Total: ~1 working day for the code refactor + ~30 min of your time across browser steps.**

---

## Status legend

- ✅ Done / no change needed
- 🟡 Update (small edit, not a rewrite)
- 🔁 Rewrite (same shape, new internals)
- ❌ Delete
- **NEW** Create from scratch

# Budget & Finance

A personal budgeting and finance tracker. Track asset balances, record income,
set yearly expense budgets, and have the app calculate where the money went
between updates.

This is the v2 web app. The earlier Electron desktop version (v1) has been
retired in favour of a hosted web build with user accounts.

## Live site

Once deployed, the app lives at `https://<your-vercel-domain>.vercel.app`. Sign
up with email + password, confirm your inbox, log in — your data is private to
your account and synced across devices.

## Stack

- **React + Vite + TypeScript** — UI
- **Supabase** — Postgres database, authentication, Row Level Security
- **Vercel** — static hosting + CI

No paid services involved; both Vercel Hobby and Supabase Free comfortably
cover an audience of a few hundred users.

## How accounts and data are isolated

Authentication is handled by Supabase Auth — passwords are bcrypt-hashed
server-side and never touch app code. Every database table has a Row Level
Security policy that chains back to `user_profile.auth_user_id = auth.uid()`,
so a query from one signed-in user can only ever return that user's rows.

See `DEPLOYMENT.md` for the full architecture story and security notes.

## Running locally

1. Clone the repo and `npm install`.
2. Create a Supabase project (free) at https://supabase.com.
3. In the Supabase **SQL Editor**, paste and run `supabase/schema.sql`.
4. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_SUPABASE_URL` — Project Settings → API → Project URL
   - `VITE_SUPABASE_ANON_KEY` — Project Settings → API → anon public key
5. `npm run dev` and open the URL it prints.

The first time you sign in, you'll go through a one-screen setup that creates
your profile and budget year. After that, the navigation is:

- **Dashboard** — net worth, monthly balance chart, income vs expenses
- **Balances** — record current asset values; saving calculates expenses for the period
- **Income** — yearly income sources and per-source income entries
- **Expenses** — category budgets and year-to-date utilisation
- **Settings** — sign out, delete all data

## Deploying

See `DEPLOYMENT.md` for the step-by-step Supabase + Vercel walkthrough.

In short: push the repo to GitHub, import it into Vercel, set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's environment
variables, hit Deploy. Vercel auto-rebuilds on every `git push` to `main`.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check and produce a production build in `dist/`
- `npm run preview` — preview the production build locally
- `npm test` — run the Vitest suite (pure domain/utility tests)

## Project layout

```
src/
  components/   shared UI (Nav, Card, Modal, MoneyInput, RequireAuth, ...)
  pages/        route screens (Dashboard, Login, Signup, Setup, ...)
  domain/       pure money / date / validation logic
  utils/        formatters and date helpers
  db/repos/     one file per table; CRUD against Supabase
  lib/          supabase client, auth provider, useAsyncQuery hook
  state/        AppContext — profile + year + revision counter
  routes.tsx    react-router config
supabase/
  schema.sql    Postgres schema + RLS policies; runs once in Supabase SQL Editor
```

## License

[MIT](LICENSE) © 2026 Irfan Zafar

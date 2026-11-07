# Smart Biashara

Smart Biashara is a React app for recording sales, stock, expenses, customer balances, supplier purchases, and business reports. Supabase stores the data; the browser app uses only the public publishable key.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Supabase project URL and publishable key. Set `VITE_SITE_URL` to the canonical HTTPS app domain in production.
4. Run `npm run dev` for local development or `npm run build` for the production bundle in `dist/`.

The `VITE_` values are public browser configuration. Never put a Supabase service-role key in a `VITE_` variable or commit a real `.env.local` file.

## Deploy to Vercel

Connect the GitHub repository, use `npm run build` as the build command, and `dist` as the output directory. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SITE_URL` to the Vercel project for each environment. `vercel.json` routes app paths back to `index.html` so direct navigation works.

## Supabase

The linked Supabase project is `jmfxxrzdxhlzjrqorpjw`. Its deployed schema has both `memberships` and `business_members`; the reviewed November 7 repair is now recorded in `supabase/migrations/`. The numbered SQL files at the repository root are historical schema snapshots, not a current, ordered migration set. Do not run them against the linked project as-is: they do not represent the current deployed schema.

The owner-only staff management function is in `supabase/functions/team/index.ts`. Deploy it with the Supabase CLI after linking the intended project and verifying its environment settings. The function needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; the privileged key must stay server-side.

## Checks

- `npm run build` type-checks the app and creates the Vite production bundle.
- `npm test` runs the existing queue tests.

The production schema still has security advisor findings. Owner cost views intentionally use definer permissions because the underlying cost columns are restricted; their view definitions filter by owner role, and only SELECT is granted to authenticated users. The profit report is a role-checked security-definer function. Review Supabase advisories after future schema changes rather than removing these protections blindly.

## Android and sharing

The app is a PWA and includes a web manifest, service worker, and Android-sized PNG icons. For an Android APK that stays on the same web origin, see [docs/APK_AND_DOMAIN.md](docs/APK_AND_DOMAIN.md). The downloaded APK and Supabase hardening patch still need to be built and applied by the project owner.

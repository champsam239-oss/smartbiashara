# Smart Biashara Manager — backend foundation

## Run
1. Create a Supabase project (or `supabase start` locally).
2. Apply `supabase/migrations/0001_core.sql` then `0002_expenses_purchases.sql` and `0003_customer_balances.sql` and `0004_purchase_payments.sql` (SQL editor or `supabase db push`).
3. On a scratch DB run `psql "$DB_URL" -f supabase/tests/acceptance.sql`. It prints ALL ACCEPTANCE CHECKS PASSED or fails with the first broken rule. It rolls back, so it leaves no data.
4. Copy `.env.example` to `.env` and fill in the URL and anon key.

## Money rules
Amounts are integer cents. Net sales − COGS = gross profit; gross profit − operating expenses = estimated net operating profit. Cash collected counts only real payments; unpaid credit is shown separately. Stock purchases are never expenses.

## Status
Done: schema, RLS, atomic sales/payments/reversals/purchases/expenses, audit trail, acceptance tests (criteria 3–10, 12).
Not done: React/PWA front end, password-reset UI, CSV/PDF export, insights, offline mode, M-Pesa, employee permission screens, deployment config. These are not implemented, so none are claimed.
Verified so far: migrations 0001-0004 apply cleanly and `acceptance.sql` passes on a local PostgreSQL 16 with a stubbed `auth` schema; `tsc` type-check and `npm test` (8 unit tests) pass. Not yet verified: behaviour against a real Supabase project, the browser UI, and real RLS role setup. See docs/DEPLOY.md.
Privacy: have a Kenyan data-protection review done (Data Protection Act, 2019) before launch. Enable Supabase point-in-time backups for recovery.

## Front end (started)
`npm install && npm run dev` (needs `.env`). `npm test` runs the money-handling unit tests. Built so far: sign up / sign in / password reset, business setup, add products with opening stock, fast sale screen (search, cart, discount, cash/M-Pesa/bank/credit, partial payment, receipt number). Calls the SQL functions for all stock and payment changes. Not yet built: dashboard, expenses, customers/debt screens, reports, exports, PWA install, insights.

Also built: supplier purchases (stock in, unpaid balances, paying invoices), rule-based insights on Home, installable PWA shell (manifest + service worker caching app files only). The PWA does NOT work offline for selling: all sales and stock changes need a connection. AI-written insights are not implemented; they need a server-side function holding the API key. Still not built: PDF export, debt-aging and slow-mover reports, customer reminders, employee role screens, offline sync, M-Pesa, multi-branch.

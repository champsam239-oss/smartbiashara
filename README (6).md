# Smart Biashara Manager — backend foundation

## Run
1. Create a Supabase project (or `supabase start` locally).
2. Apply `supabase/migrations/0001_core.sql` then `0002_expenses_purchases.sql` (SQL editor or `supabase db push`).
3. On a scratch DB run `psql "$DB_URL" -f supabase/tests/acceptance.sql`. It prints ALL ACCEPTANCE CHECKS PASSED or fails with the first broken rule. It rolls back, so it leaves no data.
4. Copy `.env.example` to `.env` and fill in the URL and anon key.

## Money rules
Amounts are integer cents. Net sales − COGS = gross profit; gross profit − operating expenses = estimated net operating profit. Cash collected counts only real payments; unpaid credit is shown separately. Stock purchases are never expenses.

## Status
Done: schema, RLS, atomic sales/payments/reversals/purchases/expenses, audit trail, acceptance tests (criteria 3–10, 12).
Not done: React/PWA front end, password-reset UI, CSV/PDF export, insights, offline mode, M-Pesa, employee permission screens, deployment config. These are not implemented, so none are claimed.
Untested: the SQL has not been run against a live database in this session. Run step 3 first and fix any failure before building on it.
Privacy: have a Kenyan data-protection review done (Data Protection Act, 2019) before launch. Enable Supabase point-in-time backups for recovery.

## Front end (started)
`npm install && npm run dev` (needs `.env`). `npm test` runs the money-handling unit tests. Built so far: sign up / sign in / password reset, business setup, add products with opening stock, fast sale screen (search, cart, discount, cash/M-Pesa/bank/credit, partial payment, receipt number). Calls the SQL functions for all stock and payment changes. Not yet built: dashboard, expenses, customers/debt screens, reports, exports, PWA install, insights.

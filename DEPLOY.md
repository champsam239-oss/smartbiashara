# Deploy checklist

1. **Supabase:** create a project. In the SQL editor run `supabase/migrations/0001` to `0004` in order.
2. **Auth settings (Authentication > URL configuration):** set Site URL to your deployed address and add it to Redirect URLs (needed for password-reset links). Keep email confirmation on. Set a minimum password length of 8.
3. **Test on a scratch project first:** `psql "$DB_URL" -f supabase/tests/acceptance.sql` must print ALL ACCEPTANCE CHECKS PASSED.
4. **Front end:** `npm install`, `npm test`, `npm run build`. Host the `dist` folder on Vercel, Netlify or Cloudflare Pages. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's settings. Add a rewrite of all paths to `/index.html`.
5. **Never** put the `service_role` key in any `VITE_` variable. Anything starting with `VITE_` is public.
6. **Backups:** enable daily backups, and point-in-time recovery on a paid plan. Test a restore once before real customers rely on it.
7. **Rate limiting:** Supabase Auth rate limits sign-in and reset emails. Review them under Authentication > Rate limits. Configure your own SMTP sender for reliable email.
8. **Privacy:** publish a privacy notice, and write a procedure to export or delete a business's data on request. Have the setup reviewed against Kenya's Data Protection Act, 2019 before launch. This project makes no compliance claim.

# Adding AI-written insights (not built)
Insights today are rule-based (`src/lib/insights.ts`). To add AI wording: create a Supabase Edge Function that (1) checks the caller's session, (2) computes the figures with the same SQL functions, (3) sends only those figures to the Anthropic API using a key stored as a function secret (`supabase secrets set ANTHROPIC_API_KEY=...`), and (4) returns plain-language text. The model must only explain supplied numbers and must not make predictions. Keep the rule-based text as the fallback when the key is missing or the call fails.

# Adding M-Pesa (not built)
Today M-Pesa is a payment method typed in by hand, with an optional reference (unique per business). To add Daraja later: get Daraja credentials, store them as Edge Function secrets, receive the callback in an Edge Function that verifies the request and writes to `payments` with the receipt number as `reference` (the unique index stops duplicates), and test in the Daraja sandbox before going live. Never store customers' PINs. Do not mark a sale paid until a verified callback arrives.

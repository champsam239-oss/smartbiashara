# Smart Biashara improvement roadmap

## Delivered in this repair

- Protect product purchase cost and per-item margin from non-owner sessions while retaining manager aggregate reporting.
- Make the sales and report queries match the deployed column permissions; prevent the `sale_items` permission error once the accompanying database patch is applied.
- Add barcode scanning with camera feature detection and support for ordinary keyboard-wedge barcode scanners.
- Add stock-count adjustment, customer debt filters and overdue summaries, CSV export, and user-triggered WhatsApp reminders.
- Add a validated same-business sales queue backup and restore path, plus retry/discard controls for rejected queued sales.
- Provide PWA icons, stable auth redirect configuration, and Vercel SPA routing.

## Recommended next additions

1. **M-Pesa payment reconciliation:** integrate Daraja through a server-side function, use idempotent callback processing, record provider references, support reversals, and add a visible reconciliation queue. This requires the merchant's Daraja credentials and callback/domain setup; never place its secrets in browser variables.
2. **Branch-aware stock:** introduce branches, branch-level inventory and transfers, and branch-scoped membership permissions. Design the schema and data migration before exposing multi-branch controls.
3. **Audit trail:** retain who changed prices, stock, sales, expenses, and roles, with timestamps and reversal links. Restrict audit access to appropriate roles.
4. **Reliable offline mode:** distinguish queued drafts from confirmed sales, show sync state clearly, prevent duplicate submissions with idempotency keys, and add conflict handling for stock changes. Offline sales cannot guarantee current stock availability.
5. **Receipts and sharing:** add printable/downloadable receipts with shop identity, tax details where applicable, and an explicit share action; avoid sending customer details without the user's choice.
6. **Operational reports:** add low-stock reorder suggestions, daily cash reconciliation, exportable date-range summaries, and role-aware dashboards.
7. **Release readiness:** define a production-domain checklist, Android signing-key custody, database backup/restore practice, and staged release process before distributing an APK.

Prioritize payment reconciliation and audit history before adding complex multi-branch workflows. Each item that changes stored data should ship with a reviewed schema migration and role/RLS checks.

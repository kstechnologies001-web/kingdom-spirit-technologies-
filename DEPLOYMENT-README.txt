KINGDOM SPIRIT TECHNOLOGY — DEPLOYMENT SUMMARY

HOSTING: Cloudflare Pages with GitHub integration and Advanced Mode (_worker.js).

ROOT-ONLY PACKAGE: All HTML pages, scripts, styles, images, SQL, config and deployment files are directly in the GitHub repository root. Do not nest them and do not upload the ZIP as a single file.

BUILD SETTINGS:
- Framework preset: None
- Build command: exit 0
- Build output directory: .
- Root directory: repository root

PUBLIC SUPABASE SETTINGS:
- Replace SUPABASE_URL in config.js.
- Replace SUPABASE_PUBLISHABLE_KEY in config.js.
- The old project URL and key have been removed.

CLOUDFLARE VARIABLES:
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, PAYSTACK_SECRET_KEY, PAYSTACK_WEBHOOK_SECRET, optional PAYSTACK_CALLBACK_URL. Store the three secret-key values as encrypted Secrets. Add Workers AI binding named AI.

DATABASE:
Run SUPABASE-SETUP.sql once in the new Supabase project's SQL Editor. Set Auth Site URL and Redirect URLs to the actual deployed domain. Promote your own administrator account using the SQL in START-HERE-KST-BACKEND.md.

API ROUTES:
GET /api/health
POST /api/chat
POST /api/enquiries
POST /api/paystack/initialize
GET /api/paystack/verify
POST /api/paystack/webhook

PAYMENTS:
Use Paystack test credentials first. Enquiries do not charge customers; only approved invoices can be paid. Payment attempts are stored independently to preserve references and reduce accidental duplicate checkout sessions.

See START-HERE-KST-BACKEND.md for the complete guided setup and live test checklist.

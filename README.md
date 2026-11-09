# Kingdom Spirit Technology website

A flat, root-only website package for Kingdom Spirit Technology. Every HTML page, JavaScript file, stylesheet, image, SQL script, Cloudflare configuration file and deployment guide is stored directly in this repository's root. There are no required nested asset or function folders.

## Start here

Read **`START-HERE-KST-BACKEND.md`**. It explains the exact setup order for a new Supabase project, GitHub repository and Cloudflare Pages site.

## What is included

- Public homepage and company, service, portfolio, contact, enquiry and policy pages.
- Customer registration, sign-in, password recovery and private client dashboard.
- Administrator dashboard for enquiries, clients, projects, invoices, notifications, uploaded files, contact messages and chatbot FAQs.
- Supabase authentication and database access with Row Level Security.
- Private client file storage (10 MiB maximum; admin uploads, customer-owned reads).
- Cloudflare Pages Advanced Mode backend in the root `_worker.js` file.
- API routes for chatbot messages, enquiries, Paystack initialization, payment verification, Paystack webhooks and `/api/health`.
- A root-level master database script: `SUPABASE-SETUP.sql`.
- Root-level configuration templates and a built-in offline checker: `npm run check`.

## Before deploying

1. Replace the two public placeholders in `config.js` with the URL and **Publishable key** from the new Supabase project.
2. Add the server-side Supabase and Paystack values to Cloudflare Pages Variables and Secrets. Keep secret keys out of `config.js`, HTML, browser JavaScript and GitHub.
3. Run `SUPABASE-SETUP.sql` once in the new Supabase project's SQL Editor.
4. Connect the GitHub repository to Cloudflare Pages using the settings in the start guide.

The root homepage is `index.html`. `home.html` is retained only as a compatibility redirect. Do not delete or rename `_worker.js`, `_redirects`, `_headers`, `wrangler.toml` or `config.js`.

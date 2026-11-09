# KST website — start here

This package is prepared for a **new GitHub repository, a new Cloudflare Pages project and a new Supabase project**. Do not reuse the old Supabase URL or API keys.

## 1. Understand the files

Everything needed by the website is at the top level (repository root):

- `index.html` — the one official homepage.
- `*.html` — all public, account, dashboard, checkout and policy pages.
- `*.js`, `*.css`, `founder.png` — browser code and assets.
- `_worker.js` — Cloudflare Pages Advanced Mode backend and API router.
- `_redirects`, `_headers` — Cloudflare redirects and security headers.
- `wrangler.toml`, `package.json` — Cloudflare and local development settings.
- `SUPABASE-SETUP.sql` — complete database, RLS, private storage and admin FAQ/contact permissions.
- `config.js` — the only file containing the two public browser-side Supabase placeholders.

`home.html` redirects to `index.html` for old bookmarks. All current navigation uses `index.html`. There is no `functions/`, `js/`, `css/`, `supabase/` or other required nested directory.

## 2. Create and configure the new Supabase project

1. Sign in at <https://supabase.com/dashboard> and create a new project. Save the database password somewhere private.
2. Open the project's **SQL Editor**, create a new query, open `SUPABASE-SETUP.sql` from this package, copy its entire contents, paste them into SQL Editor and run it once. The script creates the tables, relationships, indexes, access policies, Paystack payment-attempt history and private `client-files` storage bucket.
3. Open **Project Settings → API Keys** (or the project's **Connect** dialog) and copy the Project URL and **Publishable key**. Create/copy the **Secret key** for server-side use. The new key formats are `sb_publishable_...` and `sb_secret_...`.
4. Open `config.js` in the root of this package. Replace only:
   - `YOUR_SUPABASE_PROJECT_REF` in `SUPABASE_URL` with the new project's reference.
   - `YOUR_SUPABASE_PUBLISHABLE_KEY` with the new Publishable key.
5. Do not put the Supabase Secret key in `config.js`. It belongs only in Cloudflare as an encrypted Secret.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to the final Cloudflare Pages address. Add these Redirect URLs (replace the hostname with the actual address):
   - `https://YOUR-SITE.pages.dev/**`
   - `https://www.YOUR-CUSTOM-DOMAIN/**` (only after you connect that custom domain)
7. In **Authentication → Providers → Email**, enable the email sign-in/sign-up flow. Choose whether email confirmation is required; the recommended launch setting is to keep confirmation enabled.

## 3. Create a new GitHub repository

1. On GitHub, create a new empty repository. A suitable name is `kst-website`.
2. Extract the ZIP package you downloaded on your device.
3. Open the extracted folder. You must see `index.html`, `_worker.js`, `config.js`, `style.css`, `SUPABASE-SETUP.sql` and `package.json` immediately.
4. Upload the **contents** of that folder to the repository's root. Do not upload the ZIP itself and do not put the extracted folder inside another folder.
5. Confirm that `index.html` is visible on the repository's main page at the same level as `_worker.js` and `config.js`.

## 4. Create the Cloudflare Pages website

1. Sign in at <https://dash.cloudflare.com/>.
2. Open **Workers & Pages → Create application → Pages → Connect to Git**. Choose GitHub and authorize Cloudflare to access the new repository.
3. Select the `kst-website` repository and its production branch (normally `main`).
4. Use these build settings:
   - Framework preset: **None**
   - Build command: **`exit 0`**
   - Build output directory: **`.`**
   - Root directory: repository root (leave it blank or use `/`, depending on the dashboard)
5. Save and deploy. Cloudflare will assign a `*.pages.dev` address. Open it and confirm that the homepage loads.
6. Copy the exact hostname Cloudflare assigned. In both `robots.txt` and `sitemap.xml`, replace `YOUR-SITE.pages.dev` with that hostname (do not include `https://` in the `robots.txt` hostname portion; keep the full `https://` URL in the sitemap). Commit and push this change to GitHub so Cloudflare redeploys it.

**Important:** this website uses Cloudflare Pages **Advanced Mode**. The root `_worker.js` file handles the API routes, applies old-URL redirects, and forwards normal page/asset requests to `env.ASSETS.fetch(request)`. Cloudflare ignores a `functions/` directory when `_worker.js` is used. Do not create a `functions/` folder for this project. The worker handles legacy redirects directly because static `_redirects` rules are not applied to requests served by Pages Functions.

## 5. Add Cloudflare Variables and Secrets

Open the new Pages project → **Settings → Variables and Secrets**. Add these in the **Production** environment. The names must match exactly.

| Name | Value | Cloudflare setting |
|---|---|---|
| `SUPABASE_URL` | New Supabase Project URL | Variable |
| `SUPABASE_PUBLISHABLE_KEY` | New Supabase Publishable key | Variable |
| `SUPABASE_SECRET_KEY` | New Supabase Secret key (`sb_secret_...`) | **Encrypted Secret** |
| `PAYSTACK_SECRET_KEY` | Paystack test Secret key (`sk_test_...`) | **Encrypted Secret** |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook signing secret (`whsec_...`) | **Encrypted Secret** |
| `PAYSTACK_CALLBACK_URL` | Optional full URL ending `/payment-success.html` | Variable |

For `PAYSTACK_CALLBACK_URL`, use the new site's full URL, for example `https://YOUR-SITE.pages.dev/payment-success.html`. You can omit this variable; the backend then uses the current site's own `/payment-success.html` URL.

Do not paste any Secret key into a browser file, GitHub, a public issue or a chat. Add the equivalent values to the **Preview** environment only if you intend preview deployments to connect to a separate/test backend. Redeploy after adding or changing variables and secrets.

## 6. Enable the chatbot AI binding

1. In the Cloudflare Pages project, open **Settings → Bindings** for the Production environment.
2. Add a **Workers AI** binding.
3. Set the variable/binding name to exactly `AI` and save.
4. Redeploy the site.

The chatbot launcher can still display without this binding, but AI replies will return a configuration message until it is enabled. The published FAQ rows are read from Supabase; only rows with `is_published = true` are public to the chatbot.

## 6A. Optional API abuse protection

After connecting a custom domain to the Cloudflare zone, open **Security rules → Create rule → Rate limiting rules** if this feature is available on your plan. A useful starting rule is to match `http.request.uri.path eq "/api/chat"`, count by source IP, allow around 20 requests per 60 seconds, then block excess requests for a short period. Adjust the threshold after observing normal traffic so genuine visitors are not blocked. Cloudflare's available fields and rule count depend on plan; this is extra protection and does not replace server-side validation. See the [Cloudflare rate-limiting guide](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/).

## 7. Create the administrator account

1. Open `https://YOUR-SITE.pages.dev/login.html?view=register`.
2. Register the email address you intend to use as the KST administrator.
3. Confirm the email if Supabase email confirmation is enabled, then sign in once. The database trigger creates the profile automatically.
4. In Supabase SQL Editor, replace the email below with that exact registered email and run:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = (
  select id from auth.users
  where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
);
```

5. Sign out and sign in again, then open `https://YOUR-SITE.pages.dev/admin-dashboard.html`.

The SQL script intentionally does not make every registered user an administrator. Promote only the account you control.

## 8. Configure Paystack when you are ready to test payments

Payment is invoice-first: a service request does not charge a visitor. The KST team must agree the scope and amount, then create an invoice for the registered customer's account in the admin dashboard.

1. Create or open your Paystack account at <https://dashboard.paystack.com/>.
2. Add the **test API Secret key** as encrypted Cloudflare `PAYSTACK_SECRET_KEY`.
3. In Paystack's Developers/API configuration, create or copy the webhook signing secret and add it as encrypted Cloudflare `PAYSTACK_WEBHOOK_SECRET`.
4. In Paystack webhook settings, use `https://YOUR-SITE.pages.dev/api/paystack/webhook` (replace with the real domain).
5. Redeploy after saving the secrets.
6. Create a test customer account, create an invoice for that customer in the admin dashboard and make a test payment. Confirm the invoice changes to `paid`.
7. Do not use live Paystack keys until test payments, webhook delivery and the invoice reconciliation flow have all been tested successfully.

Each payment session is recorded in the private `payment_attempts` table. The backend reuses an outstanding checkout instead of silently overwriting its reference; Paystack's signed webhook and server-side transaction verification both compare the paid amount and currency against the invoice.

## 9. Verify the live deployment

Open these paths using the real Cloudflare hostname:

| URL | Expected result |
|---|---|
| `/` | Official homepage |
| `/index.html` | Same official homepage |
| `/home.html` | Redirects to `/index.html` |
| `/contact.html` | Contact form page |
| `/login.html` | Login and registration page |
| `/reset-password.html` | Password reset page |
| `/api/health` | JSON showing `ok: true` and readiness flags |
| `/api/chat` with GET | `405 Method not allowed` (chat accepts POST) |
| `/missing-page.html` | Custom 404 page |

The health endpoint reports only readiness booleans; it never returns credentials. `supabase: true`, `paystack: true` and `workersAI: true` indicate the matching server settings/binding are present. A green readiness flag does not replace end-to-end testing.

## 9A. Optional custom domain

In Cloudflare Pages → your project → **Custom domains**, add the domain you own and follow Cloudflare's DNS instructions. Wait until Cloudflare marks it active and HTTPS works. Then update the Supabase Auth Site URL and Redirect URLs, `PAYSTACK_CALLBACK_URL` (if you set it), `robots.txt` and `sitemap.xml` to use the final hostname. Commit and push the file changes so Cloudflare redeploys.

## 10. Test the actual features before announcing the website

- [ ] Homepage, about, service, portfolio, careers, contact and policy pages load.
- [ ] All navigation and service links open the intended root-level page.
- [ ] Contact form creates a row in `contact_messages`; visitors cannot read the inbox.
- [ ] Chatbot opens; AI replies work; the chatbot only receives published FAQs.
- [ ] Registration, email confirmation, login, logout and password recovery work.
- [ ] Guest quote/project/consultation requests create rows in `enquiries`.
- [ ] A signed-in customer's requests are associated with their profile.
- [ ] The customer dashboard shows only that customer's records.
- [ ] Only the administrator account can open and use the admin dashboard.
- [ ] Admin can create projects, invoices, milestones and notifications, and upload a private client file.
- [ ] A customer can download only files shared with their own account.
- [ ] A pending/overdue invoice opens the correct Paystack test checkout.
- [ ] Successful payment marks the matching invoice as paid.
- [ ] Failed/cancelled payment does not mark an invoice as paid.
- [ ] The webhook route accepts genuine Paystack signatures and rejects invalid signatures.

## 11. Local code check (optional)

With Node.js 20 or later installed, open a terminal in the extracted project root and run:

```bash
npm install
npm run check
```

For local Cloudflare Pages development, copy `.dev.vars.example` to `.dev.vars`, add test values, and run:

```bash
npm run dev
```

`.dev.vars` is excluded by `.gitignore`. Never upload it to GitHub.

## Key safety rules

- `config.js` may contain only the Supabase Project URL and Publishable key. The Publishable key is designed for browser use; Row Level Security still controls what it can access.
- `SUPABASE_SECRET_KEY`, `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` must remain encrypted server-side secrets.
- Never disable RLS to make a feature work. Fix the relevant policy instead.
- Never ask customers for card numbers, PINs, OTPs or passwords.
- Robots rules and hidden pages are not access controls. Authentication and RLS protect customer/admin data.
- A successful upload or static link check does not prove external account settings. Live Supabase, AI and Paystack features must be tested in the new accounts.

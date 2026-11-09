# Cloudflare Pages deployment reference

This is a static HTML/CSS/JavaScript site with a Cloudflare Pages Advanced Mode Worker. It has no build framework or nested `functions/` directory.

## Git integration settings

- Provider: GitHub
- Framework preset: None
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: repository root
- Production branch: normally `main`

The root `_worker.js` file is part of the output directory. It routes `/api/*` requests and sends all other requests to `env.ASSETS.fetch(request)`. In Advanced Mode, Cloudflare ignores any `functions/` directory. Keep `_worker.js` in the root. It also applies the legacy URL redirects directly, because `_redirects` rules are not applied to requests handled by Pages Functions.

## Required bindings and values

Add the following in the Pages project's Production environment under **Settings → Variables and Secrets**:

| Name | Type | Notes |
|---|---|---|
| `SUPABASE_URL` | Variable | New project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Variable | Browser-level key, also used to validate signed-in access tokens |
| `SUPABASE_SECRET_KEY` | Encrypted Secret | Server-only Supabase key |
| `PAYSTACK_SECRET_KEY` | Encrypted Secret | Start with Paystack test key |
| `PAYSTACK_WEBHOOK_SECRET` | Encrypted Secret | Current timestamped webhook signing secret |
| `PAYSTACK_CALLBACK_URL` | Variable, optional | Full URL for `/payment-success.html` |

Add a Workers AI binding named exactly `AI` under the Pages project's Production Bindings. Redeploy after changing values or bindings.

For extra abuse protection after connecting a custom domain, consider a WAF rate-limiting rule for `http.request.uri.path eq "/api/chat"`, counted by source IP. A starting point is 20 requests per 60 seconds with a short block duration. Rule availability and limits vary by Cloudflare plan; see the [official rate-limiting guide](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/).

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Safe readiness response |
| `/api/chat` | POST | Workers AI support chatbot |
| `/api/enquiries` | POST | Validates and stores quote/consultation/project requests |
| `/api/paystack/initialize` | POST | Authenticates the customer and creates/reuses a payment attempt for their invoice |
| `/api/paystack/verify` | GET | Verifies Paystack transaction status and updates the matching invoice |
| `/api/paystack/webhook` | POST | Validates Paystack signature and reconciles successful payment |

All server-side Supabase REST calls use `SUPABASE_SECRET_KEY`. The browser never receives it. Payment references are stored separately in the private `payment_attempts` table so retries do not overwrite older references. Project files are kept in a private 10 MiB storage bucket; only admins can upload or delete, and clients can read files under their own account folder.

## Local development

Use Node.js 20 or later. Copy `.dev.vars.example` to `.dev.vars`, supply test-only credentials, then run:

```bash
npm install
npm run check
npm run dev
```

The local Pages development command starts Wrangler with the Workers AI binding name `AI`. Local AI calls may incur account usage. `.dev.vars` is ignored by Git.

## CLI deployment (alternative to Git integration)

The included deploy command uses the Pages project name `kst-website`. Use it only if you chose Direct Upload rather than connecting the project to GitHub. Create that project name first or change the name in `package.json` and `wrangler.toml` to match:

```bash
npx wrangler login
npm run deploy
```

For the recommended GitHub connection, push commits to the connected production branch instead. Do not mix the two deployment workflows.

## Public hostname placeholders

After the first deployment assigns the real `*.pages.dev` hostname, replace `YOUR-SITE.pages.dev` in both `robots.txt` and `sitemap.xml` with that exact hostname, then commit and push the changes.

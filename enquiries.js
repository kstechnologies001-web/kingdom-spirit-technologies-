import { configuredSupabase, getAuthenticatedUser, json, missingConfig, serviceHeaders } from "./server-supabase.js";

const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) {
        return json({ error: "Cross-origin requests are not allowed." }, 403);
      }
    } catch {
      return json({ error: "Invalid request origin." }, 403);
    }
  }

  const missing = missingConfig(env, ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
  if (missing.length || !configuredSupabase(env)) {
    return json({ error: "The enquiry service is not configured yet. Please contact the team directly." }, 503);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 24_000) return json({ error: "Your message is too large. Please shorten it and try again." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Please submit a valid enquiry form." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Please submit a valid enquiry form." }, 400);
  }

  // Quietly discard bot submissions caught by the hidden honeypot field.
  if (clean(body.company_website, 200)) return json({ success: true, request_id: null });

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 50);
  const service = clean(body.service, 180);
  const budget = clean(body.budget, 100);
  const message = clean(body.message, 8000);
  const source = clean(body.source, 80) || "website";

  if (name.length < 2) return json({ error: "Please enter your full name." }, 400);
  if (!emailPattern.test(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (message.length < 5) return json({ error: "Please provide a little more detail about your request." }, 400);

  let clientId = null;
  const authorization = request.headers.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) {
    const { user, error } = await getAuthenticatedUser(request, env);
    if (error) return json({ error: error.message }, 401);
    clientId = user?.id || null;
  }

  const supabaseUrl = String(env.SUPABASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${supabaseUrl}/rest/v1/enquiries`, {
    method: "POST",
    headers: serviceHeaders(env, {
      "content-type": "application/json",
      Prefer: "return=representation"
    }),
    body: JSON.stringify({
      client_id: clientId,
      name,
      email,
      phone: phone || null,
      service: service || null,
      budget: budget || null,
      message,
      source,
      status: "new"
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Supabase enquiry insert failed:", response.status, detail.slice(0, 500));
    return json({ error: "We could not save your request just now. Please try again or contact us directly." }, 502);
  }

  const rows = await response.json();
  return json({ success: true, request_id: rows?.[0]?.id || null });
}

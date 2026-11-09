import {
  configuredSupabase,
  getAuthenticatedUser,
  json,
  missingConfig,
  serviceHeaders
} from "./server-supabase.js";

const supabaseRest = (env, table) => `${String(env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`;

async function verifyWithPaystack(reference, secret) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${secret}` }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function updateAttempt(env, reference, values) {
  const url = new URL(supabaseRest(env, "payment_attempts"));
  url.searchParams.set("reference", `eq.${reference}`);
  return fetch(url, {
    method: "PATCH",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(values)
  });
}

async function markPaymentAsPaid(env, attempt, paidAt) {
  const invoiceUrl = new URL(supabaseRest(env, "invoices"));
  invoiceUrl.searchParams.set("id", `eq.${attempt.invoice_id}`);
  const invoiceUpdate = await fetch(invoiceUrl, {
    method: "PATCH",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ status: "paid", paid_at: paidAt || new Date().toISOString() })
  });
  if (!invoiceUpdate.ok) return false;

  const attemptUpdate = await updateAttempt(env, attempt.reference, {
    status: "paid",
    verified_at: new Date().toISOString()
  });
  return attemptUpdate.ok;
}

export async function onRequestPost({ request, env }) {
  const missing = missingConfig(env, [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "PAYSTACK_SECRET_KEY"
  ]);
  if (missing.length || !configuredSupabase(env)) {
    return json({ error: "Online payment is not configured yet. Please contact the team." }, 503);
  }

  const { user, error: authError } = await getAuthenticatedUser(request, env);
  if (authError) return json({ error: authError.message }, 401);
  if (!user?.email) return json({ error: "A valid signed-in customer account is required." }, 401);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 4_000) return json({ error: "Invalid payment request." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid payment request." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid payment request." }, 400);
  }
  const invoiceId = String(body.invoice_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return json({ error: "A valid invoice is required." }, 400);

  const invoiceUrl = new URL(supabaseRest(env, "invoices"));
  invoiceUrl.searchParams.set("id", `eq.${invoiceId}`);
  invoiceUrl.searchParams.set("client_id", `eq.${user.id}`);
  invoiceUrl.searchParams.set("select", "id,invoice_number,amount,currency,status");
  const invoiceResponse = await fetch(invoiceUrl, { headers: serviceHeaders(env) });
  if (!invoiceResponse.ok) return json({ error: "Could not load this invoice." }, 502);
  const invoice = (await invoiceResponse.json())?.[0];
  if (!invoice) return json({ error: "Invoice not found for this account." }, 404);

  const amount = Number(invoice.amount);
  const amountKobo = Math.round(amount * 100);
  const currency = String(invoice.currency || "NGN").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amountKobo) || Math.abs(amount * 100 - amountKobo) > 0.000001) {
    return json({ error: "This invoice has an invalid payment amount. Please contact the team." }, 422);
  }
  if (["paid", "cancelled"].includes(String(invoice.status).toLowerCase())) {
    return json({ error: "This invoice cannot be paid." }, 409);
  }
  if (currency !== "NGN") return json({ error: "Only NGN invoices are currently supported by this checkout." }, 422);

  // Reuse an outstanding checkout instead of creating a second charge session.
  const activeAttemptUrl = new URL(supabaseRest(env, "payment_attempts"));
  activeAttemptUrl.searchParams.set("invoice_id", `eq.${invoice.id}`);
  activeAttemptUrl.searchParams.set("status", "eq.initialized");
  activeAttemptUrl.searchParams.set("select", "invoice_id,reference,amount_kobo,currency,authorization_url");
  activeAttemptUrl.searchParams.set("order", "created_at.desc");
  activeAttemptUrl.searchParams.set("limit", "1");
  const activeAttemptResponse = await fetch(activeAttemptUrl, { headers: serviceHeaders(env) });
  if (!activeAttemptResponse.ok) return json({ error: "Could not check the existing payment session." }, 502);
  const activeAttempt = (await activeAttemptResponse.json())?.[0];

  if (activeAttempt) {
    // A null URL means another request is currently creating the Paystack session.
    // Never return an empty checkout URL or create a second attempt in this state.
    if (!activeAttempt.authorization_url) {
      return json({ error: "A payment session is being prepared. Please refresh and try again." }, 409);
    }
    const { response: verifyResponse, body: verifyBody } = await verifyWithPaystack(activeAttempt.reference, env.PAYSTACK_SECRET_KEY);
    if (!verifyResponse.ok || !verifyBody.status || String(verifyBody.data?.reference || "") !== activeAttempt.reference) {
      return json({ error: verifyBody.message || "The existing payment session could not be checked. Please contact support before trying again." }, 502);
    }

    const paymentStatus = String(verifyBody.data?.status || "").toLowerCase();
    if (paymentStatus === "success") {
      const paidAmount = Number(verifyBody.data.amount);
      const paidCurrency = String(verifyBody.data.currency || "").toUpperCase();
      if (paidAmount !== amountKobo || Number(activeAttempt.amount_kobo) !== amountKobo || paidCurrency !== currency || String(activeAttempt.currency).toUpperCase() !== currency) {
        return json({ error: "The existing payment does not match this invoice. Please contact support." }, 409);
      }
      const updated = await markPaymentAsPaid(env, activeAttempt, verifyBody.data.paid_at);
      if (!updated) return json({ error: "Payment is confirmed, but the invoice update needs attention. Please contact support." }, 502);
      return json({ error: "This invoice has already been paid. Refresh your customer dashboard." }, 409);
    }

    if (paymentStatus === "failed" || paymentStatus === "abandoned") {
      const failedUpdate = await updateAttempt(env, activeAttempt.reference, {
        status: "failed",
        verified_at: new Date().toISOString()
      });
      if (!failedUpdate.ok) return json({ error: "The previous payment could not be closed safely. Please contact support." }, 502);
    } else {
      return json({ authorization_url: activeAttempt.authorization_url, reference: activeAttempt.reference, reused: true });
    }
  }

  // Reserve the reference in Supabase BEFORE calling Paystack. This avoids an
  // orphaned hosted checkout whose webhook has no matching database attempt.
  const reference = `KST-${invoice.id}-${crypto.randomUUID()}`;
  const reserveResponse = await fetch(supabaseRest(env, "payment_attempts"), {
    method: "POST",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({
      invoice_id: invoice.id,
      client_id: user.id,
      reference,
      amount_kobo: amountKobo,
      currency,
      authorization_url: null,
      status: "initialized"
    })
  });
  if (!reserveResponse.ok) {
    // The partial unique index also protects simultaneous clicks. A competing
    // request may have reserved the row; the customer can safely retry once.
    console.error("Could not reserve payment attempt:", (await reserveResponse.text()).slice(0, 300));
    return json({ error: "A payment session could not be reserved. Refresh the invoice and try again." }, 409);
  }

  const callbackUrl = env.PAYSTACK_CALLBACK_URL || `${new URL(request.url).origin}/payment-success.html`;
  let paystackResponse;
  let result;
  try {
    paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          invoice_id: invoice.id,
          user_id: user.id,
          invoice_number: invoice.invoice_number
        }
      })
    });
    result = await paystackResponse.json().catch(() => ({}));
  } catch (error) {
    try {
      await updateAttempt(env, reference, { status: "failed", verified_at: new Date().toISOString() });
    } catch (updateError) {
      console.error("Could not close payment attempt after Paystack network failure", reference);
    }
    console.error("Paystack initialization request failed", error?.name || "network error");
    return json({ error: "Paystack could not be reached. No checkout link was issued; please try again." }, 502);
  }

  if (!paystackResponse.ok || !result.status || !result.data?.authorization_url) {
    try {
      await updateAttempt(env, reference, { status: "failed", verified_at: new Date().toISOString() });
    } catch (error) {
      console.error("Could not close unsuccessful payment attempt", reference);
    }
    return json({ error: result.message || "Paystack could not initialize payment." }, 502);
  }

  // Attach the hosted checkout URL to the already-reserved reference.
  const attemptUpdate = await updateAttempt(env, reference, { authorization_url: result.data.authorization_url });
  if (!attemptUpdate.ok) {
    await updateAttempt(env, reference, { status: "failed", verified_at: new Date().toISOString() });
    console.error("Could not save Paystack authorization URL for payment attempt", reference);
    return json({ error: "The checkout could not be safely saved. Please contact support before trying again." }, 502);
  }

  // The payment_attempts row is canonical for reconciliation. This invoice field
  // is retained for dashboard display and is not required by the webhook.
  const latestReferenceUrl = new URL(supabaseRest(env, "invoices"));
  latestReferenceUrl.searchParams.set("id", `eq.${invoice.id}`);
  const invoiceReferenceUpdate = await fetch(latestReferenceUrl, {
    method: "PATCH",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ paystack_reference: reference })
  });
  if (!invoiceReferenceUpdate.ok) {
    console.error("Could not update invoice display reference; payment_attempts is still recorded", reference);
  }

  return json({ authorization_url: result.data.authorization_url, reference, reused: false });
}

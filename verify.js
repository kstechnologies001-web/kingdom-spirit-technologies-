import { json, missingConfig, serviceHeaders } from "./server-supabase.js";

const supabaseRest = (env, table) => `${String(env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`;

export async function onRequestGet({ request, env }) {
  if (missingConfig(env, ["PAYSTACK_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY"]).length) {
    return json({ error: "Payment verification is not configured." }, 503);
  }
  const reference = new URL(request.url).searchParams.get("reference") || "";
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(reference)) return json({ error: "A valid payment reference is required." }, 400);

  const attemptUrl = new URL(supabaseRest(env, "payment_attempts"));
  attemptUrl.searchParams.set("reference", `eq.${reference}`);
  attemptUrl.searchParams.set("select", "invoice_id,reference,amount_kobo,currency,status");
  attemptUrl.searchParams.set("limit", "1");
  const attemptResponse = await fetch(attemptUrl, { headers: serviceHeaders(env) });
  if (!attemptResponse.ok) return json({ error: "Could not find the payment attempt." }, 502);
  const attempt = (await attemptResponse.json())?.[0];
  if (!attempt) return json({ error: "No payment attempt matches this reference." }, 404);

  const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` }
  });
  const verification = await paystackResponse.json().catch(() => ({}));
  if (!paystackResponse.ok || !verification.status) {
    return json({ error: verification.message || "Unable to verify this transaction." }, 502);
  }
  if (String(verification.data?.reference || "") !== reference) {
    return json({ error: "Paystack returned a different payment reference." }, 409);
  }
  if (verification.data?.status !== "success") {
    return json({ verified: false, status: verification.data?.status || "pending" });
  }

  const invoiceUrl = new URL(supabaseRest(env, "invoices"));
  invoiceUrl.searchParams.set("id", `eq.${attempt.invoice_id}`);
  invoiceUrl.searchParams.set("select", "id,amount,currency,status");
  invoiceUrl.searchParams.set("limit", "1");
  const invoiceResponse = await fetch(invoiceUrl, { headers: serviceHeaders(env) });
  if (!invoiceResponse.ok) return json({ error: "Could not load the invoice for this payment." }, 502);
  const invoice = (await invoiceResponse.json())?.[0];
  if (!invoice) return json({ error: "The invoice for this payment no longer exists." }, 404);

  const expectedAmount = Math.round(Number(invoice.amount) * 100);
  const paidAmount = Number(verification.data.amount);
  const expectedCurrency = String(invoice.currency || "NGN").toUpperCase();
  const paidCurrency = String(verification.data.currency || "").toUpperCase();
  if (expectedAmount !== paidAmount || Number(attempt.amount_kobo) !== paidAmount || expectedCurrency !== paidCurrency || String(attempt.currency).toUpperCase() !== paidCurrency) {
    return json({ error: "The payment amount or currency does not match the invoice." }, 409);
  }

  const invoiceUpdateUrl = new URL(supabaseRest(env, "invoices"));
  invoiceUpdateUrl.searchParams.set("id", `eq.${invoice.id}`);
  const invoiceUpdate = await fetch(invoiceUpdateUrl, {
    method: "PATCH",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ status: "paid", paid_at: verification.data.paid_at || new Date().toISOString() })
  });
  if (!invoiceUpdate.ok) return json({ error: "Payment was verified but the invoice could not be updated." }, 502);

  const attemptUpdateUrl = new URL(supabaseRest(env, "payment_attempts"));
  attemptUpdateUrl.searchParams.set("reference", `eq.${reference}`);
  const attemptUpdate = await fetch(attemptUpdateUrl, {
    method: "PATCH",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ status: "paid", verified_at: new Date().toISOString() })
  });
  if (!attemptUpdate.ok) return json({ error: "Payment is confirmed but the payment record could not be updated. Please contact support." }, 502);

  return json({ verified: true, status: "paid", invoice_id: invoice.id });
}

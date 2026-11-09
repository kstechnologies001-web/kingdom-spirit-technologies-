import { missingConfig, serviceHeaders } from "./server-supabase.js";

const supabaseRest = (env, table) => `${String(env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`;
const textResponse = (message, status = 200) => new Response(message, {
  status,
  headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" }
});

const toHex = (buffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");

async function hmacSha512(secret, payloadBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
}

function constantTimeEqualBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]{128}$/i.test(hex)) return null;
  const output = new Uint8Array(64);
  for (let index = 0; index < output.length; index++) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

async function verifyCurrentPaystackSignature(rawBody, header, secret, now = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let timestamp = null;
  const signatures = [];

  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === "t") {
      if (timestamp !== null || !/^\d+$/.test(value)) return false;
      timestamp = Number(value);
    } else if (name === "v1") {
      const colon = value.indexOf(":");
      if (colon > 0) signatures.push(value.slice(colon + 1));
    }
  }

  if (timestamp === null || !Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300 || !signatures.length) {
    return false;
  }

  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signedPayload = new Uint8Array(prefix.length + rawBody.length);
  signedPayload.set(prefix, 0);
  signedPayload.set(rawBody, prefix.length);
  const expected = await hmacSha512(secret, signedPayload);

  return signatures.some((signature) => {
    const candidate = hexToBytes(signature);
    return candidate ? constantTimeEqualBytes(expected, candidate) : false;
  });
}

async function verifyLegacyPaystackSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const candidate = hexToBytes(signature);
  if (!candidate) return false;
  const expected = await hmacSha512(secret, rawBody);
  return constantTimeEqualBytes(expected, candidate);
}

export async function onRequestPost({ request, env }) {
  if (missingConfig(env, ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]).length) {
    return textResponse("Not configured", 503);
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!rawBody.length) return textResponse("Empty payload", 400);
  if (rawBody.length > 1_000_000) return textResponse("Payload too large", 413);

  // Current Paystack signing-secret header is preferred; legacy header remains
  // supported while the dashboard still sends it during key migration.
  const currentSignature = request.headers.get("paystack-signature") || "";
  const legacySignature = request.headers.get("x-paystack-signature") || "";
  let signatureValid = false;

  if (currentSignature) {
    if (!env.PAYSTACK_WEBHOOK_SECRET) return textResponse("Webhook signing secret not configured", 503);
    signatureValid = await verifyCurrentPaystackSignature(rawBody, currentSignature, env.PAYSTACK_WEBHOOK_SECRET);
  } else if (legacySignature) {
    if (!env.PAYSTACK_SECRET_KEY) return textResponse("Legacy webhook verification secret not configured", 503);
    signatureValid = await verifyLegacyPaystackSignature(rawBody, legacySignature, env.PAYSTACK_SECRET_KEY);
  }

  if (!signatureValid) return textResponse("Invalid signature", 401);

  let event;
  try { event = JSON.parse(new TextDecoder().decode(rawBody)); }
  catch { return textResponse("Invalid JSON", 400); }

  if (event?.event !== "charge.success" || event?.data?.status !== "success" || !event?.data?.reference) {
    return textResponse("ok", 200);
  }

  const reference = String(event.data.reference);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(reference)) return textResponse("Invalid reference", 400);

  const attemptUrl = new URL(supabaseRest(env, "payment_attempts"));
  attemptUrl.searchParams.set("reference", `eq.${reference}`);
  attemptUrl.searchParams.set("select", "invoice_id,reference,amount_kobo,currency,status");
  attemptUrl.searchParams.set("limit", "1");
  const attemptLookup = await fetch(attemptUrl, { headers: serviceHeaders(env) });
  if (!attemptLookup.ok) return textResponse("Payment attempt lookup failed", 500);
  const attempt = (await attemptLookup.json())?.[0];
  if (!attempt) return textResponse("Payment attempt not found", 404);

  const invoiceUrl = new URL(supabaseRest(env, "invoices"));
  invoiceUrl.searchParams.set("id", `eq.${attempt.invoice_id}`);
  invoiceUrl.searchParams.set("select", "id,amount,currency,status");
  invoiceUrl.searchParams.set("limit", "1");
  const invoiceLookup = await fetch(invoiceUrl, { headers: serviceHeaders(env) });
  if (!invoiceLookup.ok) return textResponse("Invoice lookup failed", 500);
  const invoice = (await invoiceLookup.json())?.[0];
  if (!invoice) return textResponse("Invoice not found", 404);

  const expectedAmount = Math.round(Number(invoice.amount) * 100);
  const paidAmount = Number(event.data.amount);
  const expectedCurrency = String(invoice.currency || "NGN").toUpperCase();
  const paidCurrency = String(event.data.currency || "").toUpperCase();
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== paidAmount || Number(attempt.amount_kobo) !== paidAmount || expectedCurrency !== paidCurrency || String(attempt.currency).toUpperCase() !== paidCurrency) {
    return textResponse("Payment amount or currency mismatch", 409);
  }

  // Mark the invoice first, then the attempt. Paystack retries failed webhook
  // responses, so a partial update can be safely completed on the next delivery.
  const invoiceUpdateUrl = new URL(supabaseRest(env, "invoices"));
  invoiceUpdateUrl.searchParams.set("id", `eq.${invoice.id}`);
  const invoiceUpdate = await fetch(invoiceUpdateUrl, {
    method: "PATCH",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ status: "paid", paid_at: event.data.paid_at || new Date().toISOString() })
  });
  if (!invoiceUpdate.ok) return textResponse("Invoice update failed", 500);

  const attemptUpdateUrl = new URL(supabaseRest(env, "payment_attempts"));
  attemptUpdateUrl.searchParams.set("reference", `eq.${reference}`);
  const attemptUpdate = await fetch(attemptUpdateUrl, {
    method: "PATCH",
    headers: serviceHeaders(env, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ status: "paid", verified_at: new Date().toISOString() })
  });
  if (!attemptUpdate.ok) return textResponse("Payment attempt update failed", 500);

  return textResponse("ok", 200);
}

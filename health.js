import { configuredSupabase, json, missingConfig } from "./server-supabase.js";

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    service: "Kingdom Spirit Technology",
    platform: "Cloudflare Pages Advanced Mode",
    version: "1.0.0",
    readiness: {
      supabase: configuredSupabase(env),
      paystack: missingConfig(env, ["PAYSTACK_SECRET_KEY", "PAYSTACK_WEBHOOK_SECRET"]).length === 0,
      workersAI: Boolean(env?.AI)
    }
  });
}

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.KST_CONFIG || {};
const isRealValue = (value) => typeof value === "string" && value.trim() !== "" &&
  !/(YOUR_|REPLACE_ME|CHANGE_ME|<[^>]+>)/i.test(value);
const isHttpsUrl = (value) => {
  if (!isRealValue(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

export const isConfigured = isHttpsUrl(cfg.SUPABASE_URL) && isRealValue(cfg.SUPABASE_PUBLISHABLE_KEY);

export const supabase = isConfigured
  ? createClient(cfg.SUPABASE_URL.replace(/\/+$/, ""), cfg.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

export function configMessage() {
  return "Account access is temporarily unavailable. Please contact our team.";
}

const LOGIN_URL = "/login.html";
const DASHBOARD_URL = "/client-dashboard.html";

export async function requireUser() {
  if (!supabase) {
    location.replace(`${LOGIN_URL}?setup=required`);
    return null;
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(`${LOGIN_URL}?next=${next}`);
    return null;
  }
  return session;
}

export async function profileFor(user) {
  if (!supabase || !user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,phone,role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export { DASHBOARD_URL };

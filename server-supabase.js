const isRealValue = (value) => typeof value === "string" && value.trim().length > 0 &&
  !/(YOUR_|REPLACE_ME|CHANGE_ME|<[^>]+>)/i.test(value);

const validProjectUrl = (value) => {
  if (!isRealValue(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

export function missingConfig(env, names) {
  return names.filter((name) => !isRealValue(env?.[name]));
}

export function configuredSupabase(env) {
  return validProjectUrl(env?.SUPABASE_URL) &&
    isRealValue(env?.SUPABASE_PUBLISHABLE_KEY) &&
    isRealValue(env?.SUPABASE_SECRET_KEY);
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    }
  });
}

export function serviceHeaders(env, extra = {}) {
  // New Supabase sb_secret_* keys are opaque API keys, not JWTs. Send them
  // only in apikey; Authorization is reserved for the signed-in user's JWT.
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    ...extra
  };
}

export async function getAuthenticatedUser(request, env) {
  if (!configuredSupabase(env)) {
    return { user: null, error: new Error("Account services are not configured.") };
  }
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return { user: null, error: new Error("Please sign in to continue.") };
  }
  const token = authorization.slice(7).trim();
  if (!token) return { user: null, error: new Error("Your sign-in session is missing.") };

  try {
    const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`
      }
    });
    const user = await response.json().catch(() => null);
    if (!response.ok || !user?.id) {
      return { user: null, error: new Error("Your sign-in session is invalid or has expired. Please sign in again.") };
    }
    return { user, error: null };
  } catch {
    return { user: null, error: new Error("Account verification is temporarily unavailable.") };
  }
}

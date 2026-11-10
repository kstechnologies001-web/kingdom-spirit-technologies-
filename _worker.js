import { onRequestPost as chat } from "./chat.js";
import { onRequestPost as enquiries } from "./enquiries.js";
import { onRequestPost as initializePayment } from "./initialize.js";
import { onRequestGet as verifyPayment } from "./verify.js";
import { onRequestPost as paystackWebhook } from "./webhook.js";
import { onRequestGet as health } from "./health.js";

const routes = new Map([
  ["/api/health", ["GET", health]],
  ["/api/chat", ["POST", chat]],
  ["/api/enquiries", ["POST", enquiries]],
  ["/api/paystack/initialize", ["POST", initializePayment]],
  ["/api/paystack/verify", ["GET", verifyPayment]],
  ["/api/paystack/webhook", ["POST", paystackWebhook]]
]);

const legacyRedirects = new Map([
  ["/home", ["/", 301]],
  ["/home.html", ["/", 301]],
  ["/dashboard", ["/client-dashboard", 302]],
  ["/account/login.html", ["/login", 301]],
  ["/account/register.html", ["/register", 301]],
  ["/account/client-dashboard.html", ["/client-dashboard", 301]],
  ["/account/reset-password.html", ["/reset-password", 301]],
  ["/account/forgot-password.html", ["/forgot-password", 301]],
  ["/admin/admin-dashboard.html", ["/admin-dashboard", 301]],
  ["/pages/about.html", ["/about", 301]],
  ["/pages/services.html", ["/services", 301]],
  ["/pages/portfolio.html", ["/portfolio", 301]],
  ["/pages/process.html", ["/process", 301]],
  ["/pages/why-choose-us.html", ["/why-choose-us", 301]],
  ["/pages/careers.html", ["/careers", 301]],
  ["/enquiries/contact.html", ["/contact", 301]],
  ["/enquiries/request-quote.html", ["/request-quote", 301]],
  ["/enquiries/project-brief.html", ["/project-brief", 301]],
  ["/enquiries/consultation.html", ["/consultation", 301]],
  ["/legal/privacy-policy.html", ["/privacy-policy", 301]],
  ["/legal/terms.html", ["/terms", 301]],
  ["/legal/cookie-policy.html", ["/cookie-policy", 301]],
  ["/legal/refund-policy.html", ["/refund-policy", 301]],
  ["/checkout/checkout.html", ["/checkout", 301]],
  ["/services/website-development.html", ["/services", 301]]
]);

function legacyRedirect(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname === "/register") {
    url.pathname = "/login";
    url.searchParams.set("view", "register");
    return Response.redirect(url.toString(), 302);
  }
  const fixed = legacyRedirects.get(url.pathname);
  if (fixed) {
    url.pathname = fixed[0];
    return Response.redirect(url.toString(), fixed[1]);
  }
  return null;
}

function apiJson(data, status = 200, extraHeaders = {}) {
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const redirect = legacyRedirect(url);
    if (redirect) return redirect;

    const route = routes.get(url.pathname);
    if (route) {
      const [method, handler] = route;
      if (request.method !== method) {
        return apiJson({ error: "Method not allowed." }, 405, { allow: method });
      }
      try {
        return await handler({
          request,
          env,
          params: {},
          data: {},
          waitUntil: (promise) => ctx.waitUntil(promise)
        });
      } catch (error) {
        console.error("KST API handler failed:", error);
        return apiJson({ error: "The service is temporarily unavailable. Please try again." }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return apiJson({ error: "API endpoint not found." }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

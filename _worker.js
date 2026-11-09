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

// Pages Advanced Mode owns every request, so apply legacy redirects here too.
// Cloudflare's _redirects file is not applied to requests handled by Functions.
const legacyRedirects = new Map([
  ["/home.html", ["/index.html", 301]],
  ["/login", ["/login.html", 302]],
  ["/dashboard", ["/client-dashboard.html", 302]],
  ["/services", ["/services.html", 302]],
  ["/about", ["/about.html", 302]],
  ["/contact", ["/contact.html", 302]],
  ["/request-quote", ["/request-quote.html", 302]],
  ["/checkout", ["/checkout.html", 302]],
  ["/account/login.html", ["/login.html", 301]],
  ["/account/register.html", ["/register.html", 301]],
  ["/account/client-dashboard.html", ["/client-dashboard.html", 301]],
  ["/account/reset-password.html", ["/reset-password.html", 301]],
  ["/account/forgot-password.html", ["/forgot-password.html", 301]],
  ["/admin/admin-dashboard.html", ["/admin-dashboard.html", 301]],
  ["/pages/about.html", ["/about.html", 301]],
  ["/pages/services.html", ["/services.html", 301]],
  ["/pages/portfolio.html", ["/portfolio.html", 301]],
  ["/pages/process.html", ["/process.html", 301]],
  ["/pages/why-choose-us.html", ["/why-choose-us.html", 301]],
  ["/pages/careers.html", ["/careers.html", 301]],
  ["/enquiries/contact.html", ["/contact.html", 301]],
  ["/enquiries/request-quote.html", ["/request-quote.html", 301]],
  ["/enquiries/project-brief.html", ["/project-brief.html", 301]],
  ["/enquiries/consultation.html", ["/consultation.html", 301]],
  ["/legal/privacy-policy.html", ["/privacy-policy.html", 301]],
  ["/legal/terms.html", ["/terms.html", 301]],
  ["/legal/cookie-policy.html", ["/cookie-policy.html", 301]],
  ["/legal/refund-policy.html", ["/refund-policy.html", 301]],
  ["/checkout/checkout.html", ["/checkout.html", 301]],
  ["/services/website-development.html", ["/services.html", 301]]
]);

const legacyPrefixes = ["/services/", "/pages/", "/enquiries/", "/legal/", "/account/", "/js/", "/css/", "/images/"];

function legacyRedirect(requestUrl) {
  const url = new URL(requestUrl);
  const fixed = legacyRedirects.get(url.pathname);
  if (fixed) {
    const [destination, status] = fixed;
    url.pathname = destination;
    return Response.redirect(url.toString(), status);
  }

  if (url.pathname === "/register") {
    url.pathname = "/login.html";
    url.searchParams.set("view", "register");
    return Response.redirect(url.toString(), 302);
  }

  const prefix = legacyPrefixes.find((item) => url.pathname.startsWith(item));
  if (prefix) {
    const remainder = url.pathname.slice(prefix.length);
    if (remainder && !remainder.includes("..")) {
      url.pathname = `/${remainder}`;
      return Response.redirect(url.toString(), 301);
    }
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

    // Advanced Mode takes ownership of all requests. Forward every non-API
    // request to the static asset binding so HTML, CSS, JS and images are served.
    return env.ASSETS.fetch(request);
  }
};

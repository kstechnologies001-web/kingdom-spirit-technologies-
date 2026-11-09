import { supabase, isConfigured } from "./supabase.js";

const forms = [...document.querySelectorAll("form[data-service-request-form]")];
const queryService = new URLSearchParams(location.search).get("service");

for (const form of forms) {
  const serviceSelect = form.querySelector('select[name="service"]');
  if (serviceSelect && queryService) {
    const requested = queryService.trim();
    const exact = [...serviceSelect.options].find((option) => option.value.toLowerCase() === requested.toLowerCase() || option.textContent.trim().toLowerCase() === requested.toLowerCase());
    if (exact) exact.selected = true;
    else {
      const option = document.createElement("option");
      option.value = requested;
      option.textContent = requested;
      option.selected = true;
      serviceSelect.add(option);
    }
  }

  let status = form.querySelector("#contactStatus, .portal-status, .ks-form-status, [aria-live]");
  if (!status) {
    status = document.createElement("p");
    status.className = "ks-note ks-form-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.append(status);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit'], button");
    if (button) button.disabled = true;
    status.textContent = "Submitting your request securely…";

    try {
      const formData = new FormData(form);
      const value = (key) => String(formData.get(key) || "").trim();
      let accessToken = "";
      if (isConfigured && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          accessToken = session?.access_token || "";
        } catch (sessionError) {
          console.warn("Could not read the current session; submitting this request as a guest.", sessionError);
        }
      }

      const payload = {
        name: value("name"),
        email: value("email"),
        phone: value("phone"),
        service: value("service"),
        budget: value("budget"),
        message: value("message"),
        source: form.id || form.getAttribute("name") || "website",
        company_website: value("company_website")
      };

      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Your request could not be submitted. Please try again.");

      const checkoutUrl = new URL("/checkout.html", location.href);
      if (result.request_id) checkoutUrl.searchParams.set("request", result.request_id);
      if (payload.service) checkoutUrl.searchParams.set("service", payload.service);
      location.assign(checkoutUrl.href);
    } catch (error) {
      status.textContent = error.message || "Your request could not be submitted. Please contact us by WhatsApp or email.";
      if (button) button.disabled = false;
    }
  });
}

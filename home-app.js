import { supabase, profileFor } from "./supabase.js";

// Backward compatibility for old links/bookmarks that used index.html?view=login/register.
const requestedView = new URLSearchParams(location.search).get("view");
if (requestedView === "login" || requestedView === "register") {
  const accountUrl = new URL("/login.html", location.origin);
  accountUrl.searchParams.set("view", requestedView);
  const next = new URLSearchParams(location.search).get("next");
  if (next) accountUrl.searchParams.set("next", next);
  location.replace(accountUrl.pathname + accountUrl.search);
} else {
  let session = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      session = data?.session || null;
    } catch (error) {
      console.warn("Could not read the current account session.", error);
    }
  }

  document.querySelectorAll("[data-guest-only]").forEach((element) => {
    element.hidden = Boolean(session);
  });
  document.querySelectorAll("[data-user-only]").forEach((element) => {
    element.hidden = !session;
  });

  if (session) {
    let profile = null;
    try { profile = await profileFor(session.user); }
    catch (error) { console.warn("Profile details are temporarily unavailable.", error); }

    const name = profile?.full_name || session.user.email?.split("@")[0] || "Customer";
    document.querySelectorAll("[data-customer-name]").forEach((element) => {
      element.textContent = name;
    });

    document.getElementById("logoutButton")?.addEventListener("click", async () => {
      if (supabase) await supabase.auth.signOut();
      location.replace("/index.html");
    });

    const countElement = document.getElementById("notificationCount");
    if (countElement && supabase) {
      try {
        const { count, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null);
        if (error) throw error;
        countElement.textContent = String(count || 0);
      } catch (error) {
        console.warn("Notification count is unavailable.", error);
      }
    }
  }
}

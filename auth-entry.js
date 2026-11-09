import { supabase, isConfigured } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const loginForm = $("#loginForm");
const registerForm = $("#registerForm");
const status = $("#authStatus");
const tabs = [...document.querySelectorAll("[data-auth-tab]")];
const params = new URLSearchParams(location.search);
const DEFAULT_DESTINATION = "/client-dashboard.html";

function safeDestination(candidate) {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return DEFAULT_DESTINATION;
  }
  try {
    const target = new URL(candidate, location.origin);
    if (target.origin !== location.origin) return DEFAULT_DESTINATION;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_DESTINATION;
  }
}

function show(view) {
  const isReg = view === "register";
  loginForm.hidden = isReg;
  registerForm.hidden = !isReg;
  tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.authTab === view)));
  $("#authTitle").textContent = isReg ? "Create your account" : "Welcome back";
  $("#authSubtitle").textContent = isReg
    ? "Create a secure client account to access your Kingdom Spirit workspace."
    : "Sign in to continue to your Kingdom Spirit client workspace.";
  status.textContent = "";
  const current = new URLSearchParams(location.search);
  current.set("view", isReg ? "register" : "login");
  history.replaceState(null, "", `${location.pathname}?${current.toString()}`);
}

function message(text) { status.textContent = text; }

tabs.forEach((tab) => tab.addEventListener("click", () => show(tab.dataset.authTab)));
show(params.get("view") === "register" ? "register" : "login");

if (params.get("setup") === "required") {
  message("Account services have not been connected yet. Please contact the website administrator to finish the Supabase setup.");
}

if (isConfigured && supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) location.replace(safeDestination(params.get("next")));
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConfigured || !supabase) return message("Account access is not configured yet. Please contact our team by WhatsApp or email.");
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  message("Signing you in…");
  try {
    const formData = new FormData(loginForm);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email") || "").trim(),
      password: formData.get("password")
    });
    if (error) throw error;
    location.replace(safeDestination(params.get("next")));
  } catch (error) {
    message(error.message || "Unable to sign in. Please check your details.");
  } finally {
    button.disabled = false;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConfigured || !supabase) return message("Account registration is not configured yet. Please contact our team by WhatsApp or email.");
  const button = registerForm.querySelector("button[type=submit]");
  button.disabled = true;
  message("Creating your account…");
  try {
    const formData = new FormData(registerForm);
    const { data, error } = await supabase.auth.signUp({
      email: String(formData.get("email") || "").trim(),
      password: formData.get("password"),
      options: {
        data: {
          full_name: String(formData.get("full_name") || "").trim(),
          phone: String(formData.get("phone") || "").trim()
        },
        emailRedirectTo: `${location.origin}${DEFAULT_DESTINATION}`
      }
    });
    if (error) throw error;
    if (data.session) {
      location.replace(safeDestination(params.get("next")));
    } else {
      message("Your account has been created. Please confirm your email using the link we sent, then sign in to continue.");
      show("login");
    }
  } catch (error) {
    message(error.message || "Unable to create your account.");
  } finally {
    button.disabled = false;
  }
});

$("#forgotLink").addEventListener("click", async (event) => {
  event.preventDefault();
  if (!isConfigured || !supabase) return message("Password recovery is not configured yet. Please contact our team.");
  const email = $("#loginEmail").value.trim();
  if (!email) return message("Enter your email address first, then select Forgot password.");
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/reset-password.html`
    });
    if (error) throw error;
    message("Password reset instructions have been sent to your email.");
  } catch (error) {
    message(error.message || "Unable to send password reset instructions.");
  }
});

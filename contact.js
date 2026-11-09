import { supabase, isConfigured } from "./supabase.js";

const form = document.querySelector("form[data-contact-message-form]");
if (form) {
  const status = form.querySelector("#contactStatus") || document.createElement("p");
  status.classList.add("portal-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  if (!status.isConnected) form.append(status);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    status.textContent = "Sending your message securely…";

    try {
      if (!isConfigured || !supabase) {
        throw new Error("The contact service is not configured yet. Please contact us by WhatsApp or email.");
      }

      const formData = new FormData(form);
      const value = (name) => String(formData.get(name) || "").trim();
      // Quietly accept the submission if a bot fills the hidden honeypot field.
      if (value("company_website")) {
        status.textContent = "Thank you. Your message has been sent.";
        form.reset();
        return;
      }

      const fullName = value("name");
      const email = value("email").toLowerCase();
      const message = value("message");
      const phone = value("phone");
      const service = value("service");
      if (fullName.length < 2) throw new Error("Please enter your full name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
      if (message.length < 5) throw new Error("Please provide a little more detail in your message.");

      // The table has only full_name, email and message columns. Keep optional form
      // details inside the message so they are not lost when saved.
      const details = [];
      if (phone) details.push(`Phone / WhatsApp: ${phone}`);
      if (service) details.push(`Service of interest: ${service}`);
      const savedMessage = details.length ? `${message}\n\nAdditional details:\n${details.join("\n")}` : message;

      const { error } = await supabase.from("contact_messages").insert({
        full_name: fullName,
        email,
        message: savedMessage
      });
      if (error) {
        console.error("Supabase contact message insert failed:", error);
        if (error.code === "42501" || error.code === "PGRST301") {
          throw new Error("Your message could not be saved because the contact table permissions are not ready. Please contact us by WhatsApp or email.");
        }
        throw new Error("We couldn't send your message just now. Please try again or contact us by WhatsApp or email.");
      }

      form.reset();
      status.textContent = "Thank you! Your message has been sent successfully. Our team will get back to you.";
    } catch (error) {
      status.textContent = error.message || "Your message could not be sent. Please try again.";
    } finally {
      if (button) button.disabled = false;
    }
  });
}

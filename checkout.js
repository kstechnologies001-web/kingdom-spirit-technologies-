import { supabase, isConfigured } from "./supabase.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const invoiceId = params.get("invoice");
const requestId = params.get("request");
const serviceName = params.get("service");
const payButton = $("#payNowButton");
const errorBox = $("#checkoutError");
const accountLink = $("#accountLink");
const stateBadge = $("#checkoutStateBadge");

function showMessage(title, message, lead = "Review your service request or pay an approved invoice securely.", state = "CHECKOUT INFORMATION") {
  $("#checkoutCardTitle").textContent = title;
  $("#checkoutMessage").textContent = message;
  $("#checkoutLead").textContent = lead;
  if (stateBadge) stateBadge.textContent = state;
}

function formatMoney(amount, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));
}

function formatDate(value) {
  if (!value) return "Not specified";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Not specified" : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

async function loadInvoice() {
  $("#checkoutHeading").textContent = "Invoice checkout";
  $("#checkoutLead").textContent = "Review the approved invoice details before continuing to Paystack.";

  if (!isConfigured || !supabase) {
    showMessage("Account services are not configured", "The public Supabase project settings are missing from config.js. Please contact the team; no payment has been taken.", "This invoice cannot be loaded until the website's Supabase connection is configured.", "SETUP REQUIRED");
    errorBox.textContent = "Checkout is not active yet. No payment has been taken.";
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const next = `${location.pathname}${location.search}`;
    accountLink.href = `/login.html?next=${encodeURIComponent(next)}`;
    showMessage("Sign in to continue", "Please sign in with the customer account that received this invoice. Invoices are private and cannot be opened from another customer's account.", "Your invoice is protected by your customer account.", "SIGN-IN REQUIRED");
    return;
  }

  accountLink.href = "/client-dashboard.html#invoices";
  accountLink.textContent = "Open customer dashboard";
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id,invoice_number,amount,currency,status,due_date")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    showMessage("Invoice not available", "We could not find an invoice for this signed-in account. Check that you are using the customer account the invoice was issued to, or contact our team.", "The website will not reveal invoices belonging to another customer.", "INVOICE NOT FOUND");
    return;
  }

  const status = String(invoice.status || "pending").toLowerCase();
  const currency = String(invoice.currency || "NGN").toUpperCase();
  $("#invoiceDetails").hidden = false;
  $("#invoiceNumber").textContent = invoice.invoice_number || invoice.id.slice(0, 8);
  $("#invoiceAmount").textContent = formatMoney(invoice.amount, currency);
  $("#invoiceStatus").textContent = status.replace(/_/g, " ").toUpperCase();
  $("#invoiceDueDate").textContent = formatDate(invoice.due_date);

  if (status === "paid") {
    showMessage("Payment already received", "This invoice is marked as paid. Thank you for choosing Kingdom Spirit Technology. You can view the invoice and payment record in your customer dashboard.", "No further payment is required for this invoice.", "PAYMENT RECEIVED");
    return;
  }
  if (status === "cancelled") {
    showMessage("This invoice is closed", "This invoice has been cancelled and cannot be paid. Please contact our team if you believe this is an error.", "A cancelled invoice cannot be used to start a payment.", "INVOICE CLOSED");
    return;
  }
  if (!Number.isFinite(Number(invoice.amount)) || Number(invoice.amount) <= 0 || currency !== "NGN") {
    showMessage("Invoice needs attention", "The amount or currency on this invoice is not supported by the current Paystack checkout. Please contact our team before making a payment.", "No payment has been started.", "REVIEW REQUIRED");
    return;
  }

  showMessage("Your invoice is ready", "Review the invoice number, due date and total above. When you continue, KST will request a secure Paystack payment session for this exact invoice amount.", "The amount shown is the stored invoice total. It is not taken until you complete payment on Paystack.", "APPROVED INVOICE · READY TO PAY");
  payButton.hidden = false;
  payButton.addEventListener("click", async () => {
    payButton.disabled = true;
    payButton.textContent = "Connecting to Paystack…";
    errorBox.textContent = "";
    try {
      const response = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ invoice_id: invoice.id })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.authorization_url) throw new Error(result.error || "Payment could not be started.");
      location.assign(result.authorization_url);
    } catch (error) {
      errorBox.textContent = error.message || "Unable to start payment. Please try again.";
      payButton.disabled = false;
      payButton.innerHTML = 'Continue to secure payment <span aria-hidden="true">↗</span>';
    }
  });
}

function showRequestConfirmation() {
  $("#checkoutHeading").textContent = "Your service request is received";
  const service = serviceName ? ` for ${serviceName}` : "";
  const requestLabel = requestId ? `Your request reference is ${requestId}. ` : "Your request has been submitted. ";
  showMessage(
    "Next step: quotation and invoice",
    `${requestLabel}Our team will review your project details${service}, discuss the scope and agree the price with you. No payment has been taken. After an approved invoice is created for your customer account, sign in and open Invoices & Payments to pay securely.`,
    "Submitting an enquiry does not create a charge. An approved invoice is required before payment can be collected.",
    "REQUEST RECEIVED"
  );
  accountLink.href = "/login.html?view=register";
  accountLink.textContent = "Create / sign in to your customer account";
  if (isConfigured && supabase) {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        accountLink.href = "/client-dashboard.html#invoices";
        accountLink.textContent = "Open my customer dashboard";
      }
    }).catch(() => {});
  }
}

try {
  if (invoiceId) await loadInvoice();
  else if (requestId || serviceName) showRequestConfirmation();
  else {
    $("#checkoutHeading").textContent = "Secure checkout";
    showMessage("No invoice selected", "Sign in to your customer dashboard to review an approved invoice, or submit a service request to begin. You will not be charged until you choose to pay an approved invoice.", "KST uses an invoice-first payment process for service projects.", "NO INVOICE SELECTED");
  }
} catch (error) {
  showMessage("Checkout could not be loaded", "Please refresh this page or contact our team for help. Your payment has not been started by this page.", "We could not complete the invoice check.", "TEMPORARY ISSUE");
  errorBox.textContent = error.message || "An unexpected error occurred.";
}

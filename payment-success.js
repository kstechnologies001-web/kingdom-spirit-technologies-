const status = document.querySelector("#paymentVerificationStatus");
const reference = new URLSearchParams(location.search).get("reference");

if (!reference) {
  status.textContent = "Paystack did not return a payment reference. Please check your invoice in the customer dashboard.";
} else {
  status.textContent = "Verifying your payment with Paystack…";
  fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`, { cache: "no-store" })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Payment verification is temporarily unavailable.");
      if (result.verified) {
        status.textContent = "Payment confirmed. Your invoice has been marked as paid. Thank you.";
      } else {
        status.textContent = `Paystack reports this transaction as ${result.status || "pending"}. Your invoice will update after payment confirmation.`;
      }
    })
    .catch((error) => {
      status.textContent = `${error.message} You can return to your dashboard to check the invoice status.`;
    });
}

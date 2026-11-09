import { supabase, requireUser, profileFor } from "./supabase.js";

const session = await requireUser();
if (!session) throw new Error("Session required");
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const profile = await profileFor(session.user).catch(() => null);
$("#clientName").textContent = profile?.full_name || session.user.email?.split("@")[0] || "there";

$("#portalLogout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.replace("/index.html");
});

function activateSection(name) {
  const button = document.querySelector(`[data-section="${name}"]`);
  const section = $("#section-" + name);
  if (!button || !section) return;
  document.querySelectorAll("[data-section]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll(".portal-section").forEach((item) => item.classList.add("portal-hidden"));
  section.classList.remove("portal-hidden");
}
document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    activateSection(button.dataset.section);
    history.replaceState(null, "", `#${button.dataset.section}`);
  });
});
const requestedSection = location.hash.replace(/^#/, "");
if (requestedSection) activateSection(requestedSection);

function renderTable(headers, rows) {
  if (!rows.length) return '<div class="portal-empty"><strong>Nothing to show yet</strong>New information will appear here when it is available.</div>';
  return `<div class="portal-table-wrap"><table class="portal-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

const [projectsResult, invoicesResult, notificationsResult, milestonesResult, filesResult, ticketsResult, enquiriesResult] = await Promise.all([
  supabase.from("projects").select("id,title,service,status,progress,due_date,updated_at").order("updated_at", { ascending: false }),
  supabase.from("invoices").select("id,invoice_number,amount,currency,status,due_date,paystack_reference").order("created_at", { ascending: false }),
  supabase.from("notifications").select("id,title,body,created_at,read_at").order("created_at", { ascending: false }),
  supabase.from("project_milestones").select("id,project_id,title,description,due_date,status").order("due_date", { ascending: true }),
  supabase.from("project_files").select("id,project_id,file_name,storage_path,created_at").order("created_at", { ascending: false }),
  supabase.from("support_tickets").select("id,subject,category,message,status,created_at").order("created_at", { ascending: false }),
  supabase.from("enquiries").select("id,service,message,status,created_at").order("created_at", { ascending: false })
]);

if (projectsResult.error) console.error(projectsResult.error);
if (invoicesResult.error) console.error(invoicesResult.error);
if (notificationsResult.error) console.error(notificationsResult.error);
const projects = projectsResult.data || [];
const invoices = invoicesResult.data || [];
const notifications = notificationsResult.data || [];
const milestones = milestonesResult.data || [];
const files = filesResult.data || [];
const tickets = ticketsResult.data || [];
const enquiries = enquiriesResult.data || [];

$("#statProjects").textContent = projects.filter((item) => !["completed", "cancelled"].includes((item.status || "").toLowerCase())).length;
$("#statInvoices").textContent = invoices.filter((item) => !["paid", "cancelled"].includes((item.status || "").toLowerCase())).length;
$("#statNotifications").textContent = notifications.filter((item) => !item.read_at).length;
const attention = [];
projects.filter((item) => (item.status || "").toLowerCase() === "awaiting client").forEach((item) => attention.push(`<p><strong>${escapeHtml(item.title)}</strong> needs your feedback or approval.</p>`));
invoices.filter((item) => ["pending", "overdue"].includes((item.status || "").toLowerCase())).forEach((item) => attention.push(`<p><strong>Invoice ${escapeHtml(item.invoice_number || item.id.slice(0, 8))}</strong> · ${escapeHtml(item.currency || "NGN")} ${Number(item.amount).toLocaleString()} · ${escapeHtml(item.status)}.</p>`));
$("#actionRequired").innerHTML = attention.length ? attention.join("") : `<div class="portal-empty"><strong>You're all caught up.</strong>Any actions requiring your attention will appear here.</div>`;

$("#recentProjects").innerHTML = projects.length
  ? renderTable(["Project", "Service", "Status", "Next date"], projects.slice(0, 5).map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.service)}</td><td><span class="portal-badge">${escapeHtml(item.status)}</span></td><td>${item.due_date ? new Date(item.due_date).toLocaleDateString() : "—"}</td></tr>`))
  : '<div class="portal-empty"><strong>No projects yet</strong>When a project is opened for you, its progress and next milestone will appear here.<br><br><a class="portal-button primary" href="/project-brief.html">Request your first service</a></div>';

$("#projectsList").innerHTML = projects.length ? renderTable(["Project", "Service", "Status", "Progress", "Due date"], projects.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.service)}</td><td><span class="portal-badge">${escapeHtml(item.status)}</span></td><td>${Math.max(0, Math.min(100, item.progress || 0))}%</td><td>${item.due_date ? new Date(item.due_date).toLocaleDateString() : "—"}</td></tr>`)) : `<div class="portal-empty"><strong>You haven't requested a service yet.</strong>When you start a project, its status and progress will appear here.<br><br><a class="portal-button primary" href="/project-brief.html">Request a service</a></div>`;
$("#requestsList").innerHTML = enquiries.length
  ? renderTable(["Request", "Details", "Status", "Submitted"], enquiries.map((item) => `<tr><td>${escapeHtml(item.service || "General enquiry")}</td><td>${escapeHtml(item.message)}</td><td><span class="portal-badge">${escapeHtml(item.status || "new")}</span></td><td>${new Date(item.created_at).toLocaleDateString()}</td></tr>`))
  : '<div class="portal-empty"><strong>No service requests yet</strong>When you submit a service request, it will appear here for you to track.</div>';

const projectNames = Object.fromEntries(projects.map((item) => [item.id, item.title]));
$("#milestonesList").innerHTML = renderTable(["Milestone", "Project", "Status", "Due date"], milestones.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(projectNames[item.project_id] || "Project")}</td><td><span class="portal-badge">${escapeHtml(item.status)}</span></td><td>${item.due_date ? new Date(item.due_date).toLocaleDateString() : "—"}</td></tr>`));
const signedFiles = await Promise.all(files.map(async (item) => {
  const { data } = await supabase.storage.from("client-files").createSignedUrl(item.storage_path, 300);
  return { ...item, signedUrl: data?.signedUrl || "" };
}));
$("#filesList").innerHTML = signedFiles.length ? renderTable(["File", "Project", "Added", "Download"], signedFiles.map((item) => `<tr><td>${escapeHtml(item.file_name)}</td><td>${escapeHtml(projectNames[item.project_id] || "Shared file")}</td><td>${new Date(item.created_at).toLocaleDateString()}</td><td>${item.signedUrl ? `<a class="portal-button" href="${escapeHtml(item.signedUrl)}" target="_blank" rel="noopener">Download</a>` : "Unavailable"}</td></tr>`)) : '<div class="portal-empty"><strong>No files shared yet</strong>Files approved for your projects will appear here.</div>';
$("#supportTicketsList").innerHTML = tickets.length ? renderTable(["Subject", "Category", "Status", "Date"], tickets.map((item) => `<tr><td>${escapeHtml(item.subject)}</td><td>${escapeHtml(item.category)}</td><td><span class="portal-badge">${escapeHtml(item.status)}</span></td><td>${new Date(item.created_at).toLocaleDateString()}</td></tr>`)) : '<div class="portal-empty">No support requests yet.</div>';

$("#invoicesList").innerHTML = renderTable(["Invoice", "Amount", "Status", "Due date", "Action"], invoices.map((item) => `<tr><td>${escapeHtml(item.invoice_number || item.id.slice(0, 8))}</td><td>${escapeHtml(item.currency || "NGN")} ${Number(item.amount).toLocaleString()}</td><td><span class="portal-badge">${escapeHtml(item.status)}</span></td><td>${item.due_date ? new Date(item.due_date).toLocaleDateString() : "—"}</td><td>${item.status !== "paid" && item.status !== "cancelled" ? `<button class="portal-button" data-pay="${escapeHtml(item.id)}">Pay now</button>` : escapeHtml(item.status)}</td></tr>`));

$("#notificationsList").innerHTML = notifications.length
  ? notifications.map((item) => `<article style="padding:14px 0;border-bottom:1px solid rgba(128,161,210,.13)"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p><small style="color:#8197b8">${new Date(item.created_at).toLocaleString()}</small>${!item.read_at ? ` <button class="portal-button" data-read="${escapeHtml(item.id)}">Mark read</button>` : ""}</article>`).join("")
  : '<div class="portal-empty"><strong>No notifications yet</strong>Important project and account updates will appear here.</div>';

const profileForm = $("#profileForm");
profileForm.elements.full_name.value = profile?.full_name || "";
profileForm.elements.email.value = session.user.email || "";
profileForm.elements.phone.value = profile?.phone || "";

// Invoice payment is handled by Cloudflare Pages Functions from the dedicated checkout page.
document.addEventListener("click", async (event) => {
  const payButton = event.target.closest("[data-pay]");
  if (payButton) {
    location.href = `/checkout.html?invoice=${encodeURIComponent(payButton.dataset.pay)}`;
    return;
  }
  const readButton = event.target.closest("[data-read]");
  if (readButton) {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", readButton.dataset.read);
    if (error) alert(error.message);
    else location.reload();
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(profileForm);
  const { error } = await supabase.from("profiles").update({ full_name: formData.get("full_name"), phone: formData.get("phone") }).eq("id", session.user.id);
  $("#profileStatus").textContent = error ? error.message : "Your profile has been updated.";
});

$("#supportForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const { error } = await supabase.from("support_tickets").insert({ client_id: session.user.id, subject: formData.get("subject"), category: formData.get("category"), message: formData.get("message") });
  $("#supportStatus").textContent = error ? error.message : "Your support request has been sent.";
  if (!error) event.currentTarget.reset();
});

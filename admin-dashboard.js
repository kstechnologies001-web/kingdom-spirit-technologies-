
import {supabase,requireUser,profileFor} from "./supabase.js";

const session = await requireUser();
if (!session) throw new Error("Sign-in required");

const profile = await profileFor(session.user);

if (profile?.role !== "admin") {
  document.querySelector("main").innerHTML = `
    <div class="portal-card">
      <h2>Access restricted</h2>
      <p>This account does not have administrator permissions.</p>
      <a class="portal-button" href="/index.html">Return to website</a>
    </div>`;
  throw new Error("Administrator role required");
}

const $ = s => document.querySelector(s);

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

$("#adminLogout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.replace("/index.html");
});

const [clients, projects, enquiries, support] = await Promise.all([
  supabase.from("profiles").select("id,full_name,phone,role"),
  supabase.from("projects").select("id,title,service,status,progress,due_date,client_id,created_at").order("created_at", {ascending:false}),
  supabase.from("enquiries").select("id,name,email,service,message,created_at,status").order("created_at", {ascending:false}),
  supabase.from("support_tickets").select("id,client_id,subject,category,message,status,created_at").order("created_at", {ascending:false})
]);

const c = clients.data || [];
const p = projects.data || [];
const q = enquiries.data || [];
const tickets = support.data || [];

$("#adminClients").textContent = c.filter(x => x.role !== "admin").length;
$("#adminProjects").textContent = p.length;
$("#adminEnquiries").textContent = q.filter(x => !["closed","converted"].includes((x.status || "").toLowerCase())).length;

document.querySelectorAll("#clientSelect, .client-select").forEach(sel => {
  c.filter(x => x.role !== "admin").forEach(x => {
    const o = document.createElement("option");
    o.value = x.id;
    o.textContent = `${x.full_name || "Client"} · ${x.id.slice(0,8)}`;
    sel.append(o);
  });
});

for (const select of [$("#milestoneProject"), $("#fileProject"), $("#updateProjectSelect")]) {
  for (const project of p) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.title;
    select.append(option);
  }
}

const makeTable = (headers, rows) => rows.length
  ? `<div class="portal-table-wrap"><table class="portal-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
  : '<div class="portal-empty">No records available.</div>';

$("#adminEnquiryList").innerHTML = makeTable(
  ["Name","Email","Service","Message","Date","Review status"],
  q.map(x => `<tr>
    <td>${esc(x.name)}</td>
    <td>${esc(x.email)}</td>
    <td>${esc(x.service)}</td>
    <td>${esc(x.message)}</td>
    <td>${new Date(x.created_at).toLocaleDateString()}</td>
    <td>
      <select data-enquiry-status="${esc(x.id)}" aria-label="Update request status">
        <option value="new" ${x.status === "new" ? "selected" : ""}>New</option>
        <option value="reviewing" ${x.status === "reviewing" ? "selected" : ""}>Reviewing</option>
        <option value="quoted" ${x.status === "quoted" ? "selected" : ""}>Quoted</option>
        <option value="converted" ${x.status === "converted" ? "selected" : ""}>Converted</option>
        <option value="closed" ${x.status === "closed" ? "selected" : ""}>Closed</option>
      </select>
    </td>
  </tr>`)
);

$("#adminEnquiryList").addEventListener("change", async event => {
  const select = event.target.closest("[data-enquiry-status]");
  if (!select) return;

  select.disabled = true;

  const {error} = await supabase
    .from("enquiries")
    .update({status:select.value})
    .eq("id", select.dataset.enquiryStatus);

  select.disabled = false;

  if (error) {
    alert(error.message);
    location.reload();
  }
});

$("#adminProjectList").innerHTML = makeTable(
  ["Project","Service","Status","Progress","Client"],
  p.map(x => `<tr>
    <td>${esc(x.title)}</td>
    <td>${esc(x.service)}</td>
    <td>${esc(x.status)}</td>
    <td>${Number(x.progress || 0)}%</td>
    <td>${esc(c.find(y => y.id === x.client_id)?.full_name || x.client_id.slice(0,8))}</td>
  </tr>`)
);

$("#adminSupportList").innerHTML = makeTable(
  ["Client","Subject","Category","Message","Status"],
  tickets.map(x => `<tr>
    <td>${esc(c.find(y => y.id === x.client_id)?.full_name || x.client_id.slice(0,8))}</td>
    <td>${esc(x.subject)}</td>
    <td>${esc(x.category)}</td>
    <td>${esc(x.message)}</td>
    <td>${esc(x.status)}</td>
  </tr>`)
);

$("#createProject").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);

  const {error} = await supabase.from("projects").insert({
    client_id:f.get("client_id"),
    title:f.get("title"),
    service:f.get("service"),
    due_date:f.get("due_date") || null,
    status:f.get("status"),
    progress:Number(f.get("progress") || 0),
    description:f.get("description") || null
  });

  $("#projectStatus").textContent = error ? error.message : "Project created.";
  if (!error) e.currentTarget.reset();
});

$("#createInvoice").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);

  const {error} = await supabase.from("invoices").insert({
    client_id:f.get("client_id"),
    invoice_number:f.get("invoice_number"),
    amount:Number(f.get("amount")),
    currency:"NGN",
    due_date:f.get("due_date") || null,
    status:"pending"
  });

  $("#invoiceStatus").textContent = error ? error.message : "Invoice created.";
  if (!error) e.currentTarget.reset();
});

$("#createNotification").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);

  const {error} = await supabase.from("notifications").insert({
    user_id:f.get("user_id"),
    title:f.get("title"),
    body:f.get("body")
  });

  $("#notificationStatus").textContent = error ? error.message : "Notification sent.";
  if (!error) e.currentTarget.reset();
});

$("#createMilestone").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);

  const {error} = await supabase.from("project_milestones").insert({
    project_id:f.get("project_id"),
    title:f.get("title"),
    due_date:f.get("due_date") || null,
    status:f.get("status"),
    description:f.get("description") || null
  });

  $("#milestoneStatus").textContent = error ? error.message : "Milestone saved.";
  if (!error) e.currentTarget.reset();
});

$("#uploadProjectFile").addEventListener("submit", async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const f = new FormData(form);
  const clientId = f.get("client_id");
  const file = f.get("file");

  if (!file || !file.size) {
    $("#fileStatus").textContent = "Choose a file first.";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    $("#fileStatus").textContent = "This file is larger than the 10 MB upload limit. Choose a smaller file.";
    return;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${clientId}/${crypto.randomUUID()}-${safeName}`;

  $("#fileStatus").textContent = "Uploading…";

  const {error:uploadError} = await supabase.storage
    .from("client-files")
    .upload(path, file, {
      contentType:file.type || "application/octet-stream",
      upsert:false
    });

  if (uploadError) {
    $("#fileStatus").textContent = uploadError.message;
    return;
  }

  const {error} = await supabase.from("project_files").insert({
    client_id:clientId,
    project_id:f.get("project_id") || null,
    file_name:file.name,
    storage_path:path
  });

  $("#fileStatus").textContent = error
    ? error.message
    : "File uploaded and shared with the selected client.";

  if (error) {
    await supabase.storage.from("client-files").remove([path]);
  } else {
    form.reset();
  }
});

$("#updateProject").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);

  const updates = {
    status:f.get("status"),
    progress:Number(f.get("progress")),
    due_date:f.get("due_date") || null,
    updated_at:new Date().toISOString()
  };

  const {error} = await supabase.from("projects")
    .update(updates)
    .eq("id", f.get("project_id"));

  $("#updateProjectStatus").textContent = error
    ? error.message
    : "Project status and progress updated.";
});

// KST CONTACT MESSAGE INBOX AND CHATBOT FAQ MANAGEMENT

const contactMessagesHost = document.querySelector("#adminContactMessages");
const contactMessageStatus = document.querySelector("#contactMessageStatus");
const refreshContactMessagesButton = document.querySelector("#refreshContactMessages");

const faqForm = document.querySelector("#faqForm");
const faqListHost = document.querySelector("#adminFaqList");
const faqStatus = document.querySelector("#faqStatus");

const faqIdInput = document.querySelector("#faqId");
const faqQuestionInput = document.querySelector("#faqQuestion");
const faqAnswerInput = document.querySelector("#faqAnswer");
const faqPublishedInput = document.querySelector("#faqPublished");

const faqSaveButton = document.querySelector("#saveFaqButton");
const faqCancelButton = document.querySelector("#cancelFaqEdit");

function setButtonBusy(button, busy, busyText, idleText) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function showInlineError(host, message) {
  if (!host) return;
  host.innerHTML = `<div class="portal-empty">${esc(message)}</div>`;
}

// LOAD CONTACT MESSAGES

async function loadAdminContactMessages() {
  if (!contactMessagesHost) return;

  if (contactMessageStatus) contactMessageStatus.textContent = "Loading…";
  if (refreshContactMessagesButton) refreshContactMessagesButton.disabled = true;

  const {data, error} = await supabase
    .from("contact_messages")
    .select("id,full_name,email,message,created_at")
    .order("created_at", {ascending:false})
    .limit(100);

  if (refreshContactMessagesButton) refreshContactMessagesButton.disabled = false;

  if (error) {
    if (contactMessageStatus) contactMessageStatus.textContent = "Could not load messages.";

    showInlineError(
      contactMessagesHost,
      `Contact inbox error: ${error.message}. Confirm that the admin SQL has been run and this account has the admin role.`
    );
    return;
  }

  const rows = data || [];

  if (contactMessageStatus) {
    contactMessageStatus.textContent = `${rows.length} message${rows.length === 1 ? "" : "s"} shown (maximum 100).`;
  }

  if (!rows.length) {
    contactMessagesHost.innerHTML = '<div class="portal-empty">No website contact messages have been received yet.</div>';
    return;
  }

  contactMessagesHost.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Message</th><th>Received</th></tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${esc(row.full_name)}</td>
              <td><a href="mailto:${encodeURIComponent(String(row.email || ""))}">${esc(row.email)}</a></td>
              <td style="white-space:pre-wrap;min-width:240px">${esc(row.message)}</td>
              <td>${esc(formatDate(row.created_at))}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function resetFaqForm() {
  if (!faqForm) return;

  faqForm.reset();

  if (faqIdInput) faqIdInput.value = "";
  if (faqPublishedInput) faqPublishedInput.value = "false";
  if (faqSaveButton) faqSaveButton.textContent = "Save FAQ";
  if (faqCancelButton) faqCancelButton.hidden = true;
}

// LOAD CHATBOT FAQS

async function loadAdminFaqs() {
  if (!faqListHost) return;

  faqListHost.innerHTML = '<div class="portal-empty">Loading FAQs…</div>';

  const {data, error} = await supabase
    .from("faq_entries")
    .select("id,question,answer,is_published,created_at,updated_at")
    .order("updated_at", {ascending:false})
    .limit(200);

  if (error) {
    showInlineError(
      faqListHost,
      `FAQ manager error: ${error.message}. Confirm that the admin SQL has been run and this account has the admin role.`
    );
    return;
  }

  const rows = data || [];

  if (!rows.length) {
    faqListHost.innerHTML = '<div class="portal-empty">No FAQs yet. Use the form above to add the first question and answer.</div>';
    return;
  }

  faqListHost.innerHTML = `
    <div class="portal-table-wrap">
      <table class="portal-table">
        <thead>
          <tr>
            <th>Question and answer</th>
            <th>Visibility</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td style="min-width:260px">
                <strong>${esc(row.question)}</strong>
                <div style="white-space:pre-wrap;margin-top:7px;color:#aebed5">${esc(row.answer)}</div>
              </td>
              <td>${row.is_published
                ? '<span class="portal-badge">Published</span>'
                : '<span class="portal-badge" style="background:rgba(212,175,55,.12);color:#f0d477">Draft</span>'}
              </td>
              <td>${esc(formatDate(row.updated_at || row.created_at))}</td>
              <td>
                <div style="display:flex;gap:7px;flex-wrap:wrap">
                  <button class="portal-button" type="button" data-faq-action="edit" data-faq-id="${esc(row.id)}">Edit</button>
                  <button class="portal-button" type="button" data-faq-action="toggle" data-faq-id="${esc(row.id)}">${row.is_published ? "Unpublish" : "Publish"}</button>
                  <button class="portal-button" type="button" data-faq-action="delete" data-faq-id="${esc(row.id)}">Delete</button>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  faqListHost.querySelectorAll("[data-faq-action]").forEach(button => {
    button.addEventListener("click", () => handleFaqAction(button, rows));
  });
}

async function handleFaqAction(button, rows) {
  const action = button.dataset.faqAction;
  const faq = rows.find(row => row.id === button.dataset.faqId);

  if (!faq) return;

  button.disabled = true;

  if (faqStatus) faqStatus.textContent = "Saving…";

  if (action === "edit") {
    if (faqIdInput) faqIdInput.value = faq.id;
    if (faqQuestionInput) faqQuestionInput.value = faq.question;
    if (faqAnswerInput) faqAnswerInput.value = faq.answer;
    if (faqPublishedInput) faqPublishedInput.value = String(Boolean(faq.is_published));

    if (faqSaveButton) faqSaveButton.textContent = "Update FAQ";
    if (faqCancelButton) faqCancelButton.hidden = false;
    if (faqStatus) faqStatus.textContent = "Editing this FAQ. Save your changes above.";

    faqForm?.scrollIntoView({behavior:"smooth", block:"center"});
    button.disabled = false;
    return;
  }

  if (action === "toggle") {
    const {error} = await supabase.from("faq_entries").update({
      is_published:!faq.is_published,
      updated_at:new Date().toISOString()
    }).eq("id", faq.id);

    if (faqStatus) {
      faqStatus.textContent = error
        ? `Could not change FAQ visibility: ${error.message}`
        : `FAQ ${faq.is_published ? "unpublished" : "published"}.`;
    }

    if (!error) await loadAdminFaqs();
    else button.disabled = false;

    return;
  }

  if (action === "delete") {
    if (!window.confirm("Delete this FAQ permanently? This cannot be undone.")) {
      button.disabled = false;
      if (faqStatus) faqStatus.textContent = "Delete cancelled.";
      return;
    }

    const {error} = await supabase.from("faq_entries").delete().eq("id", faq.id);

    if (faqStatus) {
      faqStatus.textContent = error
        ? `Could not delete FAQ: ${error.message}`
        : "FAQ deleted.";
    }

    if (!error) {
      if (faqIdInput?.value === faq.id) resetFaqForm();
      await loadAdminFaqs();
    } else {
      button.disabled = false;
    }
  }
}

// REFRESH CONTACT INBOX

if (refreshContactMessagesButton) {
  refreshContactMessagesButton.addEventListener("click", loadAdminContactMessages);
}

// CANCEL FAQ EDIT

if (faqCancelButton) {
  faqCancelButton.addEventListener("click", () => {
    resetFaqForm();
    if (faqStatus) faqStatus.textContent = "Edit cancelled.";
  });
}

// SAVE OR UPDATE FAQ

if (faqForm) {
  faqForm.addEventListener("submit", async event => {
    event.preventDefault();

    const question = faqQuestionInput?.value.trim() || "";
    const answer = faqAnswerInput?.value.trim() || "";
    const isPublished = faqPublishedInput?.value === "true";
    const faqId = faqIdInput?.value || "";

    if (!question || !answer) {
      if (faqStatus) faqStatus.textContent = "Enter both a question and an answer.";
      return;
    }

    setButtonBusy(
      faqSaveButton,
      true,
      "Saving…",
      faqId ? "Update FAQ" : "Save FAQ"
    );

    const payload = {
      question,
      answer,
      is_published:isPublished,
      updated_at:new Date().toISOString()
    };

    const result = faqId
      ? await supabase.from("faq_entries").update(payload).eq("id", faqId)
      : await supabase.from("faq_entries").insert(payload);

    if (result.error) {
      if (faqStatus) faqStatus.textContent = `Could not save FAQ: ${result.error.message}`;

      setButtonBusy(
        faqSaveButton,
        false,
        "Saving…",
        faqId ? "Update FAQ" : "Save FAQ"
      );
      return;
    }

    if (faqStatus) {
      faqStatus.textContent = faqId
        ? "FAQ updated successfully."
        : "FAQ added successfully.";
    }

    resetFaqForm();
    setButtonBusy(faqSaveButton, false, "Saving…", "Save FAQ");

    await loadAdminFaqs();
  });
}

// LOAD BOTH ADMIN SECTIONS

await Promise.all([
  loadAdminContactMessages(),
  loadAdminFaqs()
]);

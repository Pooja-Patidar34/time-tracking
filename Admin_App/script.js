function roundToNearest15(minutes) {
  return Math.round(minutes / 15) * 15;
}

function formatTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

let employees = [], projects = [], tasks = [], timeEntries = [], materials = [];
let editingId = null;

async function loadData() {
  const [empRes, projRes, taskRes, entryRes, matRes] = await Promise.all([
    fetch("/api/employees"),
    fetch("/api/projects"),
    fetch("/api/tasks"),
    fetch("/api/time-entries"),
    fetch("/api/materials")
  ]);
  employees = await empRes.json();
  projects = await projRes.json();
  tasks = await taskRes.json();
  timeEntries = await entryRes.json();
  materials = await matRes.json();

  renderEmployees();
  renderProjects();
  renderDashboard();
  renderApprovals();
  populateDropdowns();
  populateFilters();
  // renderMaterialsTab();
  renderMaterialsTable();
}

function showAdminAlert(msg, type = "error") {
  const box = document.getElementById("adminAlert");
  box.classList.remove("alert--error", "alert--success");
  box.classList.add(type === "success" ? "alert--success" : "alert--error");
  box.textContent = msg;
  box.style.display = "block";
  setTimeout(() => { box.style.display = "none"; }, 4000);
}


// Filters for Dashboard
function populateFilters() {
  const empSelect = document.getElementById("employeeFilter");
  const projSelect = document.getElementById("projectFilter");

  // Reset options
  empSelect.innerHTML = `<option value="">All</option>`;
  projSelect.innerHTML = `<option value="">All</option>`;

  employees.forEach(e => {
    empSelect.insertAdjacentHTML("beforeend",
      `<option value="${e.id}">${e.name} (${e.id})</option>`);
  });

  projects.forEach(p => {
    projSelect.insertAdjacentHTML("beforeend",
      `<option value="${p.id}">${p.name}</option>`);
  });
}


// --- Dashboard (approved only) ---
function renderDashboard() {
  const tbody = document.querySelector("#dashboardTable tbody");
  tbody.innerHTML = "";

  // Filters (if you added them earlier)
  const selectedEmp = document.getElementById("employeeFilter")?.value || "";
  const selectedProj = document.getElementById("projectFilter")?.value || "";
  const timeRange = document.getElementById("timeFilter")?.value || "all";

  // Start with approved only
  let rows = timeEntries.filter(e => e.approved);

  // Apply employee/project filters
  if (selectedEmp) rows = rows.filter(e => e.employee_id === selectedEmp);
  if (selectedProj) rows = rows.filter(e => e.project_id === selectedProj);

  // Apply time filter (supports presets + custom range if present)
  rows = rows.filter(entry => {
    const d = new Date(entry.timestamp);
    if (timeRange === "week") return d >= new Date(Date.now() - 7*24*60*60*1000);
    if (timeRange === "month") return d >= new Date(Date.now() - 30*24*60*60*1000);
    if (timeRange === "year") return d >= new Date(Date.now() - 365*24*60*60*1000);
    if (timeRange === "custom") {
      const fromEl = document.getElementById("dateFrom");
      const toEl = document.getElementById("dateTo");
      const from = fromEl && fromEl.value ? new Date(fromEl.value) : null;
      const to = toEl && toEl.value ? new Date(toEl.value) : null;
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    return true;
  });

  // Sort by date desc
  rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Render rows in the requested column order
  rows.forEach(entry => {
    const emp = employees.find(e => e.id === entry.employee_id);
    const proj = projects.find(p => p.id === entry.project_id);
    const task = tasks.find(t => t.id === entry.task_id);
    const dateOnly = (entry.timestamp.split("T")[0] || entry.timestamp.split(" ")[0]);

    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${emp?.id || entry.employee_id}</td>
        <td>${emp?.name || "?"}</td>
        <td>${proj?.id || entry.project_id}</td>
        <td>${proj?.name || "?"}</td>
        <td>${task?.name || "?"}</td>
        <td>${formatTime(entry.minutes_spent)}</td>
        <td>${dateOnly}</td>
      </tr>
    `);
  });
}




// --- Approvals (pending only) ---
function renderApprovals() {
  const tbody = document.querySelector("#approvalsTable tbody");
  tbody.innerHTML = "";

  // Pending only
  const pending = timeEntries.filter(e => !e.approved);

  // (Optional) keep the same date sort for consistency
  pending.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  pending.forEach(entry => {
    const emp = employees.find(e => e.id === entry.employee_id);
    const proj = projects.find(p => p.id === entry.project_id);
    const task = tasks.find(t => t.id === entry.task_id);
    const dateOnly = (entry.timestamp.split("T")[0] || entry.timestamp.split(" ")[0]);

    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${emp?.id || entry.employee_id}</td>
        <td>${emp?.name || "?"}</td>
        <td>${proj?.id || entry.project_id}</td>
        <td>${proj?.name || "?"}</td>
        <td>${task?.name || "?"}</td>
        <td>${formatTime(entry.minutes_spent)}</td>
        <td>${dateOnly}</td>
        <td>
          <button onclick="approveEntry(${entry.id})">Approve</button>
          <button onclick="openEditModal(${entry.id})">Edit</button>
        </td>
      </tr>
    `);
  });
}


// --- Approve (just reuse edit-time) ---
async function approveEntry(id) {
  const entry = timeEntries.find(e => e.id === id);
  if (!entry) return;
  const updated = { ...entry, approved: true };
  const res = await fetch("/api/edit-time", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, updated })
  });
  if (res.ok) await loadData();
}

// --- Modal ---
const modal = document.getElementById("editModal");
const closeBtn = document.querySelector(".close");

function populateDropdowns() {
  document.getElementById("editEmployee").innerHTML =
    employees.map(e => `<option value="${e.id}">${e.name} (${e.id})</option>`).join("");
  document.getElementById("editProject").innerHTML =
    projects.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  document.getElementById("editTask").innerHTML =
    tasks.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
}

function openEditModal(id) {
  editingId = id;
  const entry = timeEntries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById("editEmployee").value = entry.employee_id;
  document.getElementById("editProject").value = entry.project_id;
  document.getElementById("editTask").value = entry.task_id;
  document.getElementById("editHours").value = Math.floor(entry.minutes_spent / 60);
  document.getElementById("editMinutes").value = entry.minutes_spent % 60;
  document.getElementById("editTimestamp").value = entry.timestamp;

  // 🔹 Material fields
  const matSelect = document.getElementById("editMaterial");
  const matNotes = document.getElementById("editMaterialNotes");

  matSelect.innerHTML = `<option value="">(none)</option>` +
    materials.map(m => `<option value="${m.id}">${m.name} (${m.id})</option>`).join("");

  if (entry.materials_used) {
    matSelect.value = entry.materials_used.material_id || "";
    matNotes.value = entry.materials_used.notes || "";
  } else {
    matSelect.value = "";
    matNotes.value = "";
  }

  modal.style.display = "block";
}

closeBtn.onclick = () => modal.style.display = "none";
window.onclick = e => { if (e.target == modal) modal.style.display = "none"; };

const projectModal = document.getElementById("projectModal");
const closeProjectModal = document.getElementById("closeProjectModal");

function openProjectModal(projectId) {
  const proj = projects.find(p => p.id === projectId);
  if (!proj) return;

  // Title
  document.getElementById("projectModalTitle").textContent =
    `${proj.id}: ${proj.name}`;

  // Totals per task
  const taskTotals = {};
  timeEntries
    .filter(e => e.project_id === projectId && e.approved)
    .forEach(e => {
      taskTotals[e.task_id] = (taskTotals[e.task_id] || 0) + e.minutes_spent;
    });

  // Fill table
  const tbody = document.querySelector("#projectTaskTable tbody");
  tbody.innerHTML = "";
  let grandTotal = 0;

  tasks.forEach(task => {
    const mins = taskTotals[task.id] || 0;
    const budgetedHours = proj.task_budgets?.[task.id] || 0;
    grandTotal += mins;

    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${task.name}</td>
        <td>${formatTime(mins)}</td>
        <td>${budgetedHours} hrs</td>
      </tr>
    `);
  });

  // Total line
  // Total budgeted hours calculation
  let totalBudgetedHours = 0;
  tasks.forEach(task => {
    totalBudgetedHours += proj.task_budgets?.[task.id] || 0;
  });

  tbody.insertAdjacentHTML("beforeend", `
    <tr style="font-weight: bold; border-top: 2px solid #ccc;">
      <td>Total</td>
      <td>${formatTime(grandTotal)}</td>
      <td>${totalBudgetedHours} hrs</td>
    </tr>
  `);

  projectModal.style.display = "block";
}


closeProjectModal.onclick = () => projectModal.style.display = "none";
window.addEventListener("click", e => {
  if (e.target === projectModal) projectModal.style.display = "none";
});

document.getElementById("editForm").addEventListener("submit", async e => {
  e.preventDefault();
  const updated = {
    employee_id: document.getElementById("editEmployee").value,
    project_id: document.getElementById("editProject").value,
    task_id: document.getElementById("editTask").value,
    minutes_spent: roundToNearest15(
      parseInt(document.getElementById("editHours").value, 10) * 60 +
      parseInt(document.getElementById("editMinutes").value, 10)
    ),
    timestamp: document.getElementById("editTimestamp").value,
    approved: true,
    materials_used: {
      material_id: document.getElementById("editMaterial").value,
      notes: document.getElementById("editMaterialNotes").value.trim()
    }
  };
  const res = await fetch("/api/edit-time", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: editingId, updated })
  });
  if (res.ok) {
    modal.style.display = "none";
    await loadData();
  }
});

// 🔴 Delete button handler
document.getElementById("deleteEntryBtn").addEventListener("click", async () => {
  if (!editingId) return;
  if (!confirm("Are you sure you want to delete this time entry? This cannot be undone.")) {
    return;
  }

  try {
    const res = await fetch("/api/delete-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      modal.style.display = "none";
      showAdminAlert("Time entry deleted successfully.", "success");
      await loadData();
    } else {
      showAdminAlert(result.error || "Failed to delete time entry.");
    }
  } catch (err) {
    console.error(err);
    showAdminAlert("Network error while deleting time entry.");
  }
});

// --- Employees + Projects ---
function renderEmployees() {
  const tbody = document.querySelector("#employeeList tbody");
  tbody.innerHTML = "";
  employees.forEach(e => {
    const row = `
      <tr>
        <td>${e.id}</td>
        <td>${e.name}</td>
        <td><button onclick="deleteEmployee('${e.id}')">Delete</button></td>
      </tr>`;
    tbody.insertAdjacentHTML("beforeend", row);
  });
}
async function deleteEmployee(id) {
  if (!confirm(`Are you sure you want to delete employee ${id}?`)) {
    return;
  }

  try {
    const res = await fetch("/api/delete-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showAdminAlert(`Employee ${id} deleted successfully.`, "success");
      await loadData();
    } else {
      showAdminAlert(result.error || "Failed to delete employee.");
    }
  } catch (err) {
    console.error(err);
    showAdminAlert("Network error while deleting employee.");
  }
}



function renderProjects() {
  const tbody = document.querySelector("#projectList tbody");
  tbody.innerHTML = "";
  projects.forEach(p => {
    const total = timeEntries
      .filter(e => e.project_id === p.id && e.approved)
      .reduce((sum, e) => sum + e.minutes_spent, 0);
    const cost = (total / 60) * 60; // $60/hr

    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${formatTime(total)}</td>
        <td>$${cost.toFixed(0)}</td>
        <td><button onclick="openProjectModal('${p.id}')">View Details</button></td>
      </tr>
    `);
  });
}


function showAdminAlert(msg) {
  const alertBox = document.getElementById("adminAlert");
  alertBox.textContent = msg;
  alertBox.style.display = "block";
  setTimeout(() => alertBox.style.display = "none", 4000); // auto hide
}

// --- Add Employee ---
document.getElementById("employeeForm").addEventListener("submit", async e => {
  e.preventDefault();
  const idInput = document.getElementById("empId");
  const nameInput = document.getElementById("empName");

  const id = idInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();

  if (!id || !name) {
    showAdminAlert("Please enter both Employee ID and Name.");
    return;
  }

  // Client-side duplicate check for instant feedback
  if (employees.some(emp => emp.id === id)) {
    showAdminAlert("Employee ID already exists. Please use a different ID.");
    return;
  }

  try {
    const res = await fetch("/api/add-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showAdminAlert("Employee added successfully.", "success");
      await loadData();
      e.target.reset();
    } else {
      showAdminAlert(result.error || "Failed to add employee.");
    }
  } catch (err) {
    console.error(err);
    showAdminAlert("Network error while adding employee.");
  }
});


// --- Add Project ---
document.getElementById("projectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("projId").value.trim().toUpperCase();
  const name = document.getElementById("projName").value.trim();

  if (!id || !name) {
    showAdminAlert("Please enter both Project ID and Name.");
    return;
  }

  // Client-side duplicate check
  if (projects.some(p => p.id === id)) {
    showAdminAlert("Project ID already exists. Please use a different ID.");
    return;
  }

  try {
    const res = await fetch("/api/add-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name })
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showAdminAlert("Project added successfully.", "success");
      await loadData();
      e.target.reset();
    } else {
      showAdminAlert(result.error || "Failed to add project.");
    }
  } catch (err) {
    console.error(err);
    showAdminAlert("Network error while adding project.");
  }
});

function renderMaterialsTable() {
  const status = document.getElementById("materialStatusFilter")?.value || "unchecked";
  const url = status === "checked"
    ? "/api/materials-reviewed"
    : "/api/materials-unreviewed";

  fetch(url)
    .then(res => res.json())
    .then(entries => {
      const tbody = document.querySelector("#materialsTable tbody");
      tbody.innerHTML = "";

      if (!entries.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--muted)">No materials to review.</td></tr>`;
        return;
      }

      entries.forEach(e => {
        const row = `
          <tr>
            <td>${e.employee_id}: ${e.employee_name}</td>
            <td>${e.project_id}</td>
            <td>${e.task_id}</td>
            <td>${e.material_id}: ${e.material_name}</td>
            <td>${e.notes || ""}</td>
            <td>${new Date(e.timestamp).toLocaleDateString()}</td>
            <td>
              ${status === "checked"
                ? `<span style="padding:2px 8px; border-radius:12px; background:#e6f7e6;">✅ Reviewed</span>`
                : `<button
                    class="mark-btn"
                    onclick="markMaterialEntered(${e.id})"
                    style="padding:4px 10px; border-radius:8px; border:1px solid #ccc; cursor:pointer;"
                  >Mark Reviewed</button>`}
            </td>
          </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", row);
      });
    })
    .catch(err => {
      console.error("Failed to fetch materials:", err);
    });
}


async function markMaterialEntered(id) {
  const button = document.querySelector(`button.mark-btn[onclick="markMaterialEntered(${id})"]`);
  if (button) {
    button.disabled = true;
    button.textContent = "Marking…";
  }

  try {
    const res = await fetch("/api/mark-material-reviewed", { // ✅ Correct endpoint
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }) // ✅ Correct payload
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("Mark reviewed failed:", res.status, txt);
      throw new Error(`HTTP ${res.status}`);
    }

    renderMaterialsTable(); // ✅ Refreshes the table
  } catch (err) {
    console.error("Failed to mark reviewed:", err);
    if (button) {
      button.disabled = false;
      button.textContent = "Mark Reviewed";
    }
    alert("Could not mark as reviewed.");
  }
}



renderMaterialsTable();
document
  .getElementById("materialStatusFilter")
  .addEventListener("change", renderMaterialsTable);




// --- Tabs ---
document.querySelectorAll(".tab-button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

document.getElementById("employeeFilter").addEventListener("change", renderDashboard);
document.getElementById("projectFilter").addEventListener("change", renderDashboard);

// Re-render dashboard whenever filters change
document.getElementById("employeeFilter").addEventListener("change", renderDashboard);
document.getElementById("projectFilter").addEventListener("change", renderDashboard);
document.getElementById("timeFilter").addEventListener("change", e => {
  // Show/hide custom date range fields
  document.getElementById("customRange").style.display =
    e.target.value === "custom" ? "inline-block" : "none";
  renderDashboard();
});
document.getElementById("dateFrom").addEventListener("change", renderDashboard);
document.getElementById("dateTo").addEventListener("change", renderDashboard);


loadData();
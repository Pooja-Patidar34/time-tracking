(function () {
  const form = document.getElementById('timeForm');
  const errorEl = document.getElementById('timeError');
  const statusText = document.getElementById('statusText');

  const materialsToggle = document.getElementById("materialsToggle");
  const materialsFields = document.getElementById("materialsFields");
  const materialSelect = document.getElementById("materialSelect");
  const materialNotes = document.getElementById("materialNotes");
  function roundToNearest15(minutes) {
    return Math.round(minutes / 15) * 15;
  }


  function populateMaterials() {
    fetch("/api/materials")
      .then(res => res.json())
      .then(materials => {
        materialSelect.innerHTML = `<option value="">Select material...</option>`;
        materials.forEach(m => {
          const option = document.createElement("option");
          option.value = m.id;
          option.textContent = `${m.name} (${m.id})`;
          materialSelect.appendChild(option);
        });
        new TomSelect("#materialSelect", {
          maxOptions: 1000,
          maxItems: 1,
          placeholder: "Select material...",
          create: false,
          hideSelected: true,
          shouldSort: false
        });
      })
      .catch(err => {
        console.error("Failed to load materials:", err);
      });
  }


  materialsToggle.addEventListener("change", () => {
    materialsFields.style.display = materialsToggle.checked ? "block" : "none";
  });

  // Populate dropdowns from backend JSON
  function populateSelect(endpoint, selectId) {
    fetch(endpoint)
      .then(res => res.json())
      .then(data => {
        const select = document.getElementById(selectId);
        data.forEach(item => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = `${item.id}: ${item.name}`;
          select.appendChild(option);
        });
      })
      .catch(err => {
        console.error(`Failed to fetch ${endpoint}:`, err);
      });
  }

  window.addEventListener('DOMContentLoaded', () => {
    populateSelect('/api/employees', 'employee');
    populateSelect('/api/projects', 'project');
    populateSelect('/api/tasks', 'task');
    populateMaterials();

    const projectSelect = document.getElementById("project");
    const taskSelect = document.getElementById("task");

    projectSelect.addEventListener("change", () => {
      if (projectSelect.value === "MISC") {
        taskSelect.value = "MISC";
        taskSelect.disabled = true;
      } else {
        taskSelect.disabled = false;
        taskSelect.value = ""; // Reset selection if it was locked
      }
    });
  });

  // Validate time input
  function getTimeSpentInMinutes() {
    const hoursInput = document.getElementById('hours');
    const minutesInput = document.getElementById('minutes');
    const h = parseInt(hoursInput.value, 10);
    const m = parseInt(minutesInput.value, 10);

    if (isNaN(h) || isNaN(m) || h < 0 || m < 0 || m > 59) {
      return NaN;
    }
    return h * 60 + m;
  }

  function showError(msg) {
    errorEl.textContent = msg || 'Please enter a valid time.';
    errorEl.style.display = 'block';
  }

  function clearError() {
    errorEl.style.display = 'none';
  }

  // Handle form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    statusText.textContent = "";

    const employeeId = document.getElementById("employee").value;
    const projectId = document.getElementById("project").value;
    const taskId = document.getElementById("task").value;
    const minutesSpent = roundToNearest15(getTimeSpentInMinutes());

    if (!employeeId || !projectId || !taskId) {
      showError("Please select an employee, project, and task.");
      return;
    }

    if (isNaN(minutesSpent) || minutesSpent <= 0) {
      showError("Please enter a valid time. Minutes must be between 0–59.");
      return;
    }

    const payload = {
      employee_id: employeeId,
      project_id: projectId,
      task_id: taskId,
      minutes_spent: minutesSpent
    };

    if (materialsToggle.checked) {
      const selectedMaterial = materialSelect.value;
      const notes = materialNotes.value.trim();

      if (!selectedMaterial) {
        alert("Please select a material to report.");
        materialSelect.focus();
        return;
      }

      payload.materials_used = {
        material_id: selectedMaterial,
        notes
      };
    }

    try {
      const res = await fetch('/api/submit-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (res.ok && result.success) {
        statusText.textContent = "✅ Time entry submitted!";
        form.reset();
        materialsFields.style.display = "none";
        populateMaterials();
      } else {
        showError("Server error: " + (result.error || "Unknown issue"));
      }
    } catch (err) {
      console.error("POST failed:", err);
      showError("Network error submitting time entry.");
    }
  });
})();
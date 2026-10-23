
const $ = (selector) => document.querySelector(selector);

let chart = null;

// API helper
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

// Escape values before inserting them into HTML
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

// Display notifications
function message(text, type = "success") {
  const element = $("#message");

  if (!element) return;

  element.textContent = text;
  element.className = `message ${type}`;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Display vehicle requirements
function requirement(vehicle) {
  const requirements = [];

  if (vehicle.size === "LARGE") {
    requirements.push("Large vehicle");
  }

  if (vehicle.needsEV) {
    requirements.push("EV charging");
  }

  if (vehicle.needsAccessible) {
    requirements.push("Accessible");
  }

  return requirements.join(", ") || "Normal";
}

// Render the vehicle table
function renderVehicles(vehicles, spaces) {
  const table = $("#vehicleTable");

  if (!table) return;

  if (!vehicles.length) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">
          No vehicle requests yet. Add a vehicle to get started.
        </td>
      </tr>
    `;

    $("#resultsCount").textContent = "0 records";
    return;
  }

  table.innerHTML = [...vehicles].reverse().map((vehicle) => {
    const status = String(vehicle.status || "PENDING");
    const statusClass = `status-${status.toLowerCase()}`;

    let action = "—";

    if (status === "PARKED") {
      action = `
        <button
          class="small-button"
          data-depart="${esc(vehicle.id)}">
          Mark departed
        </button>
      `;
    } else if (status === "PENDING" || status === "WAITING") {
      action = '<span class="muted">Awaiting allocation</span>';
    }

    const assignedSpace = vehicle.spaceId || "—";

    const space = spaces.find(
      (item) => item.id === vehicle.spaceId
    );

    const distance = space
      ? `${space.distance} m`
      : "—";

    return `
      <tr>
        <td>
          <strong>${esc(vehicle.name)}</strong><br>
          <span class="muted">${esc(vehicle.id)}</span>
        </td>
        <td>${esc(requirement(vehicle))}</td>
        <td>${esc(assignedSpace)}</td>
        <td>${esc(distance)}</td>
        <td>
          <span class="status ${statusClass}">
            ${esc(status)}
          </span>
        </td>
        <td>${action}</td>
      </tr>
    `;
  }).join("");

  $("#resultsCount").textContent = `${vehicles.length} records`;
}

// Refresh the dashboard from the backend
async function refresh() {
  const state = await api("/api/state");

  const spaces = Array.isArray(state.spaces)
    ? state.spaces
    : [];

  const vehicles = Array.isArray(state.vehicles)
    ? state.vehicles
    : [];

  const summary = state.summary || {};

  $("#totalSpaces").textContent =
    summary.totalSpaces ?? spaces.length;

  $("#availableSpaces").textContent =
    summary.availableSpaces ?? 0;

  $("#occupiedSpaces").textContent =
    summary.occupiedSpaces ?? 0;

  $("#pendingVehicles").textContent =
    summary.pendingVehicles ?? 0;

  $("#parkingSubtitle").textContent =
    `${summary.totalSpaces ?? spaces.length} spaces · live status`;

  // Associate parked vehicles with their spaces
  const parkedVehicles = new Map(
    vehicles
      .filter((vehicle) =>
        vehicle.status === "PARKED" && vehicle.spaceId
      )
      .map((vehicle) => [vehicle.spaceId, vehicle])
  );

  // Render the parking lot
  const parkingGrid = $("#parkingGrid");

  if (parkingGrid) {
    parkingGrid.innerHTML = spaces.map((space) => {
      const vehicle = parkedVehicles.get(space.id);

      const type = space.type === "NORMAL"
        ? "Normal"
        : space.type;

      let specialClass = "";

      if (space.type === "EV") {
        specialClass = "ev";
      } else if (space.type === "ACCESSIBLE") {
        specialClass = "accessible";
      }

      return `
        <div class="space ${
          space.available ? "available" : "occupied"
        } ${specialClass}">
          <span class="car-icon">
            ${space.available ? "🅿️" : "🚗"}
          </span>
          <span class="space-id">${esc(space.id)}</span>
          <span class="space-type">${esc(type)}</span>
          <span class="space-distance">
            ${esc(space.distance)} m
          </span>
          ${
            vehicle
              ? `<span class="space-type">${esc(vehicle.name)}</span>`
              : ""
          }
        </div>
      `;
    }).join("");
  }

  renderVehicles(vehicles, spaces);
}

// Convert a numeric value safely for display
function fmt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

// Clear comparison output
function clearComparison() {
  if (chart) {
    chart.destroy();
    chart = null;
  }

  const cards = $("#comparisonCards");

  if (cards) {
    cards.innerHTML = [
      "Greedy cost",
      "Hungarian cost",
      "Greedy time",
      "Hungarian time"
    ].map((label) => `
      <div class="metric-card">
        <span>${label}</span>
        <strong>—</strong>
      </div>
    `).join("");
  }
}

// Render comparison results safely
function renderComparison(data) {
  // The frontend expects { greedy: {...}, hungarian: {...} }.
  // Check this before accessing totalCost.
  if (
    !data ||
    !data.greedy ||
    !data.hungarian ||
    typeof data.greedy !== "object" ||
    typeof data.hungarian !== "object"
  ) {
    console.error(
      "Unexpected /api/compare response:",
      data
    );

    clearComparison();

    message(
      "The comparison API returned an unexpected response. Check backend/server.js.",
      "error"
    );

    return false;
  }

  const greedy = data.greedy;
  const hungarian = data.hungarian;

  const greedyCost = Number(greedy.totalCost ?? 0);
  const hungarianCost = Number(hungarian.totalCost ?? 0);

  const greedyAssigned = Number(greedy.vehiclesAssigned ?? 0);
  const hungarianAssigned = Number(hungarian.vehiclesAssigned ?? 0);

  const greedyTime = Number(greedy.executionTimeMs ?? 0);
  const hungarianTime = Number(hungarian.executionTimeMs ?? 0);

  const cards = $("#comparisonCards");

  if (cards) {
    cards.innerHTML = `
      <div class="metric-card">
        <span>Greedy total cost</span>
        <strong>${fmt(greedyCost)}</strong>
      </div>
      <div class="metric-card">
        <span>Hungarian total cost</span>
        <strong>${fmt(hungarianCost)}</strong>
      </div>
      <div class="metric-card">
        <span>Greedy time</span>
        <strong>${fmt(greedyTime)} ms</strong>
      </div>
      <div class="metric-card">
        <span>Hungarian time</span>
        <strong>${fmt(hungarianTime)} ms</strong>
      </div>
    `;
  }

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const canvas = $("#comparisonChart");

  if (!canvas || typeof Chart === "undefined") {
    return true;
  }

  chart = new Chart(canvas, {
    type: "bar",

    data: {
      labels: [
        "Total cost",
        "Vehicles assigned",
        "Execution time (ms)"
      ],

      datasets: [
        {
          label: "Greedy",
          data: [
            greedyCost,
            greedyAssigned,
            greedyTime
          ]
        },
        {
          label: "Hungarian",
          data: [
            hungarianCost,
            hungarianAssigned,
            hungarianTime
          ]
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: {
          position: "bottom"
        }
      },

      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  return true;
}

// Add a vehicle submitted by the user
$("#vehicleForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("#vehicleName").value.trim();
  const size = $("#vehicleSize").value;
  const needsEV = $("#needsEV").checked;
  const needsAccessible = $("#needsAccessible").checked;

  if (!name) {
    message("Please enter a vehicle name.", "error");
    return;
  }

  if (needsEV && needsAccessible) {
    message(
      "This demo has no combined EV-accessible spaces. Choose one requirement.",
      "error"
    );
    return;
  }

  try {
    await api("/api/vehicles", {
      method: "POST",
      body: JSON.stringify({
        name,
        size,
        needsEV,
        needsAccessible
      })
    });

    event.target.reset();

    await refresh();

    message(
      "Vehicle request added. Run an allocation algorithm when ready."
    );
  } catch (error) {
    message(error.message, "error");
  }
});

// Run the selected allocation algorithm
$("#runBtn").addEventListener("click", async () => {
  const button = $("#runBtn");

  button.disabled = true;
  button.textContent = "Allocating…";

  try {
    const response = await api("/api/allocate", {
      method: "POST",
      body: JSON.stringify({
        algorithm: $("#algorithmSelect").value
      })
    });

    await refresh();

    // Support the documented response shape.
    const result = response.result;

    if (!result) {
      console.error("Unexpected /api/allocate response:", response);

      message(
        "Allocation response is missing its result. Check backend/server.js.",
        "error"
      );

      return;
    }

    message(
      `${result.algorithm}: ${result.vehiclesAssigned} assigned, ` +
      `${result.vehiclesUnassigned} unassigned. ` +
      `Total cost: ${Number(result.totalCost ?? 0).toFixed(1)}.`
    );

    const comparison = await api("/api/compare");
    renderComparison(comparison);
  } catch (error) {
    message(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Run allocation →";
  }
});

// Compare algorithms without committing assignments
$("#compareBtn").addEventListener("click", async () => {
  try {
    const data = await api("/api/compare");

    if (renderComparison(data)) {
      message("Comparison complete. The parking lot was not changed.");
    }
  } catch (error) {
    message(error.message, "error");
  }
});

// Mark a parked vehicle as departed
$("#vehicleTable").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-depart]");

  if (!button) return;

  try {
    const response = await api(
      `/api/depart/${encodeURIComponent(button.dataset.depart)}`,
      { method: "POST" }
    );

    await refresh();

    message(response.message || "Vehicle departure recorded.");
  } catch (error) {
    message(error.message, "error");
  }
});

// Reset the simulation
$("#resetBtn").addEventListener("click", async () => {
  if (!confirm("Reset the simulation and make all spaces available?")) {
    return;
  }

  try {
    await api("/api/reset", {
      method: "POST"
    });

    clearComparison();

    await refresh();

    message("Simulation reset.");
  } catch (error) {
    message(error.message, "error");
  }
});

// Load the initial dashboard
refresh().catch((error) => {
  message(`Could not load the app: ${error.message}`, "error");
});

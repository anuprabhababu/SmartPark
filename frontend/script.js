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
    return String(value ? ? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[c]);
}

// Display notification messages
function message(text, type = "success") {
    const el = $("#message");

    if (!el) return;

    el.textContent = text;
    el.className = `message ${type}`;

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

// Render vehicle allocation table
function renderVehicles(vehicles, spaces) {
    const table = $("#vehicleTable");

    if (!table) return;

    // No default vehicles: show an empty state
    if (vehicles.length === 0) {
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

    // Display only vehicles returned by the backend
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

        const distance = space ?
            `${space.distance} m` :
            "—";

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

// Refresh the dashboard using backend data
async function refresh() {
    const state = await api("/api/state");

    const spaces = Array.isArray(state.spaces) ?
        state.spaces :
        [];

    const vehicles = Array.isArray(state.vehicles) ?
        state.vehicles :
        [];

    const summary = state.summary || {};

    $("#totalSpaces").textContent = summary.totalSpaces ? ? spaces.length;
    $("#availableSpaces").textContent = summary.availableSpaces ? ? 0;
    $("#occupiedSpaces").textContent = summary.occupiedSpaces ? ? 0;
    $("#pendingVehicles").textContent = summary.pendingVehicles ? ? 0;

    $("#parkingSubtitle").textContent =
        `${summary.totalSpaces ?? spaces.length} spaces · live status`;

    // Map currently parked vehicles to their spaces
    const parkedVehicles = new Map(
        vehicles
        .filter((vehicle) => vehicle.status === "PARKED" && vehicle.spaceId)
        .map((vehicle) => [vehicle.spaceId, vehicle])
    );

    // Render parking spaces
    $("#parkingGrid").innerHTML = spaces.map((space) => {
                const vehicle = parkedVehicles.get(space.id);

                const type = space.type === "NORMAL" ?
                    "Normal" :
                    space.type;

                const specialClass =
                    space.type === "EV" ?
                    "ev" :
                    space.type === "ACCESSIBLE" ?
                    "accessible" :
                    "";

                return `
      <div class="space ${space.available ? "available" : "occupied"} ${specialClass}">
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

  renderVehicles(vehicles, spaces);
}

// Render comparison metrics and chart
function renderComparison(data) {
  const greedy = data.greedy;
  const hungarian = data.hungarian;

  const fmt = (value) => Number(value ?? 0).toFixed(2);

  $("#comparisonCards").innerHTML = `
    <div class="metric-card">
      <span>Greedy total cost</span>
      <strong>${fmt(greedy.totalCost)}</strong>
    </div>

    <div class="metric-card">
      <span>Hungarian total cost</span>
      <strong>${fmt(hungarian.totalCost)}</strong>
    </div>

    <div class="metric-card">
      <span>Greedy time</span>
      <strong>${fmt(greedy.executionTimeMs)} ms</strong>
    </div>

    <div class="metric-card">
      <span>Hungarian time</span>
      <strong>${fmt(hungarian.executionTimeMs)} ms</strong>
    </div>
  `;

  if (chart) {
    chart.destroy();
    chart = null;
  }

  const canvas = $("#comparisonChart");

  if (!canvas || typeof Chart === "undefined") return;

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
            greedy.totalCost,
            greedy.vehiclesAssigned,
            greedy.executionTimeMs
          ]
        },

        {
          label: "Hungarian",
          data: [
            hungarian.totalCost,
            hungarian.vehiclesAssigned,
            hungarian.executionTimeMs
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

    message("Vehicle request added. Run an allocation algorithm when ready.");
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
    const result = await api("/api/allocate", {
      method: "POST",

      body: JSON.stringify({
        algorithm: $("#algorithmSelect").value
      })
    });

    await refresh();

    const allocation = result.result;

    message(
      `${allocation.algorithm}: ${allocation.vehiclesAssigned} assigned, ` +
      `${allocation.vehiclesUnassigned} unassigned. ` +
      `Total cost: ${Number(allocation.totalCost).toFixed(1)}.`
    );

    renderComparison(await api("/api/compare"));
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

    renderComparison(data);

    message("Comparison complete. The parking lot was not changed.");
  } catch (error) {
    message(error.message, "error");
  }
});

// Mark a parked vehicle as departed
$("#vehicleTable").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-depart]");

  if (!button) return;

  try {
    const result = await api(
      `/api/depart/${encodeURIComponent(button.dataset.depart)}`,
      { method: "POST" }
    );

    await refresh();

    message(result.message);
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

    if (chart) {
      chart.destroy();
      chart = null;
    }

    $("#comparisonCards").innerHTML = [
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
const INF = 1e8;
const UNASSIGNED_COST = 10000;

function compatible(vehicle, space) {
  if (vehicle.needsAccessible && space.type !== "ACCESSIBLE") return false;
  if (vehicle.needsEV && space.type !== "EV") return false;
  if (vehicle.size === "LARGE" && space.type !== "LARGE") return false;
  return true;
}

function cost(vehicle, space) {
  if (!compatible(vehicle, space)) return INF;
  let value = Number(space.distance) || 0;
  if (space.type === "EV" && !vehicle.needsEV) value += 100;
  if (space.type === "ACCESSIBLE" && !vehicle.needsAccessible) value += 1000;
  if (space.type === "LARGE" && vehicle.size !== "LARGE") value += 25;
  return value;
}

function summarize(algorithm, assignments) {
  const assigned = assignments.filter(a => a.status === "Assigned");
  return {
    algorithm, assignments,
    totalCost: assigned.reduce((sum, a) => sum + a.cost, 0),
    averageDistance: assigned.length ? assigned.reduce((sum, a) => sum + a.distance, 0) / assigned.length : 0,
    vehiclesAssigned: assigned.length,
    vehiclesUnassigned: assignments.length - assigned.length
  };
}

function greedyAllocate(vehicles, spaces) {
  const free = spaces.filter(s => s.available).map(s => ({ ...s }));
  const assignments = [];
  for (const vehicle of vehicles) {
    let bestIndex = -1, bestCost = INF;
    for (let i = 0; i < free.length; i++) {
      const current = cost(vehicle, free[i]);
      if (current < bestCost) { bestCost = current; bestIndex = i; }
    }
    if (bestIndex < 0 || bestCost >= INF) {
      assignments.push({ vehicleId: vehicle.id, vehicleName: vehicle.name, spaceId: null, status: "Unassigned", cost: 0 });
    } else {
      const [space] = free.splice(bestIndex, 1);
      assignments.push({ vehicleId: vehicle.id, vehicleName: vehicle.name, spaceId: space.id, spaceType: space.type, status: "Assigned", distance: Number(space.distance) || 0, cost: bestCost });
    }
  }
  return summarize("Greedy", assignments);
}

// Standard Hungarian algorithm for a rectangular matrix with rows <= columns.
function hungarian(matrix) {
  const n = matrix.length;
  if (!n) return [];
  const m = matrix[0].length;
  if (n > m) throw new Error("Hungarian algorithm requires columns >= rows.");
  const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = matrix[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }
  const result = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}

function hungarianAllocate(vehicles, spaces) {
  const free = spaces.filter(s => s.available);
  if (!vehicles.length) return summarize("Hungarian", []);
  // One dummy column per vehicle permits a vehicle to remain unassigned.
  const matrix = vehicles.map(vehicle => [
    ...free.map(space => cost(vehicle, space)),
    ...vehicles.map(() => UNASSIGNED_COST)
  ]);
  const chosen = hungarian(matrix);
  const assignments = vehicles.map((vehicle, i) => {
    const col = chosen[i], value = col < 0 ? UNASSIGNED_COST : matrix[i][col];
    if (col < 0 || col >= free.length || value >= UNASSIGNED_COST) {
      return { vehicleId: vehicle.id, vehicleName: vehicle.name, spaceId: null, status: "Unassigned", cost: 0 };
    }
    const space = free[col];
    return { vehicleId: vehicle.id, vehicleName: vehicle.name, spaceId: space.id, spaceType: space.type, status: "Assigned", distance: Number(space.distance) || 0, cost: value };
  });
  return summarize("Hungarian", assignments);
}

function runAlgorithm(name, vehicles, spaces) {
  if (name === "greedy") return greedyAllocate(vehicles, spaces);
  if (name === "hungarian") return hungarianAllocate(vehicles, spaces);
  throw new Error("Choose greedy or hungarian.");
}
module.exports = { compatible, cost, greedyAllocate, hungarianAllocate, runAlgorithm };

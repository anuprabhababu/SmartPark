require("dotenv").config();
const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { connectDatabase } = require("./database");
const { greedyAllocate, hungarianAllocate, runAlgorithm } = require("./algorithms");

const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const spaces = [
    ["P1", "NORMAL", 8],
    ["P2", "NORMAL", 12],
    ["P3", "NORMAL", 18],
    ["P4", "NORMAL", 24],
    ["P5", "NORMAL", 30],
    ["P6", "NORMAL", 35],
    ["P7", "EV", 10],
    ["P8", "EV", 22],
    ["P9", "ACCESSIBLE", 6],
    ["P10", "LARGE", 28],
    ["P11", "NORMAL", 40],
    ["P12", "NORMAL", 45]
].map(([id, type, distance]) => ({ id, type, distance, available: true }));
let vehicles = [];
let history = [];

function state() {
    return {
        spaces,
        vehicles,
        history,
        summary: {
            totalSpaces: spaces.length,
            availableSpaces: spaces.filter(s => s.available).length,
            occupiedSpaces: spaces.filter(s => !s.available).length,
            pendingVehicles: vehicles.filter(v => ["PENDING", "WAITING"].includes(v.status)).length
        }
    };
}
app.get("/api/state", (req, res) => res.json(state()));

app.post("/api/vehicles", (req, res) => {
    const { name, size = "NORMAL", needsEV = false, needsAccessible = false } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Enter a vehicle name or ID." });
    if (!["NORMAL", "LARGE"].includes(size)) return res.status(400).json({ error: "Invalid vehicle size." });
    if (needsEV && needsAccessible) return res.status(400).json({ error: "This demo has no combined EV-accessible spaces. Choose one requirement." });
    const vehicle = { id: `V-${randomUUID().slice(0,8).toUpperCase()}`, name: String(name).trim(), size, needsEV: Boolean(needsEV), needsAccessible: Boolean(needsAccessible), status: "PENDING" };
    vehicles.push(vehicle);
    res.status(201).json({ vehicle, state: state() });
});

app.post("/api/compare", (req, res) => {
    const pending = vehicles.filter(v => ["PENDING", "WAITING"].includes(v.status));
    const available = spaces.filter(s => s.available);
    let t = performance.now();
    const greedy = greedyAllocate(pending, available);
    greedy.executionTimeMs = performance.now() - t;
    t = performance.now();
    const hungarian = hungarianAllocate(pending, available);
    hungarian.executionTimeMs = performance.now() - t;
    res.json({ greedy, hungarian, pendingCount: pending.length, availableCount: available.length });
});

app.post("/api/allocate", (req, res) => {
    const algorithm = String(req.body ?.algorithm || "greedy").toLowerCase();
    if (!["greedy", "hungarian"].includes(algorithm)) return res.status(400).json({ error: "Choose greedy or hungarian." });
    const pending = vehicles.filter(v => ["PENDING", "WAITING"].includes(v.status));
    const available = spaces.filter(s => s.available);
    const start = performance.now();
    let result;
    try { result = runAlgorithm(algorithm, pending, available); } catch (error) { return res.status(400).json({ error: error.message }); }
    result.executionTimeMs = performance.now() - start;
    for (const a of result.assignments) {
        const vehicle = vehicles.find(v => v.id === a.vehicleId);
        if (!vehicle) continue;
        if (a.status === "Assigned" && a.spaceId) {
            const space = spaces.find(s => s.id === a.spaceId);
            if (space && space.available) {
                space.available = false;
                vehicle.status = "PARKED";
                vehicle.spaceId = space.id;
            } else {
                vehicle.status = "WAITING";
                a.status = "Unassigned";
                a.spaceId = null;
            }
        } else vehicle.status = "WAITING";
    }
    result.timestamp = new Date().toISOString();
    history.unshift(result);
    res.json({ result, state: state() });
});

app.post("/api/depart/:id", (req, res) => {
    const vehicle = vehicles.find(v => v.id === req.params.id);
    if (!vehicle || vehicle.status !== "PARKED" || !vehicle.spaceId) return res.status(404).json({ error: "No parked vehicle found with that ID." });
    const space = spaces.find(s => s.id === vehicle.spaceId);
    if (space) space.available = true;
    const released = vehicle.spaceId;
    delete vehicle.spaceId;
    vehicle.status = "DEPARTED";
    res.json({ message: `${vehicle.name} departed. ${released} is available again.`, state: state() });
});

app.post("/api/reset", (req, res) => {
    spaces.forEach(s => s.available = true);
    vehicles = vehicles.map(v => ({ id: v.id, name: v.name, size: v.size, needsEV: v.needsEV, needsAccessible: v.needsAccessible, status: "PENDING" }));
    history = [];
    res.json({ state: state() });
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../frontend/index.html")));
connectDatabase().finally(() => app.listen(PORT, () => console.log(`SmartPark running at http://localhost:${PORT}`)));
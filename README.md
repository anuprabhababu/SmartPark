# SmartPark

A web-based smart parking allocation simulation for an Algorithm Analysis and Design project.

## Features
- Parking lot dashboard and availability counters
- Add vehicle requests with normal, large, EV, or accessible requirements
- Greedy allocation and Hungarian minimum-cost batch assignment
- Comparison of allocation cost, vehicles assigned, and execution time
- Simulated vehicle departures
- Chart.js comparison chart
- Optional MongoDB connection helper

## Run locally
1. Install Node.js 18 or newer.
2. Open this folder in VS Code.
3. Run `npm install` in the terminal.
4. Run `npm start`.
5. Open `http://localhost:5000`.

The app uses in-memory demo state by default, so MongoDB is not required to try the interface. To configure a MongoDB connection, copy `.env.example` to `.env` and add your MongoDB Atlas connection string as `MONGODB_URI`. Note: the database connection helper is included, but persistent MongoDB models and read/write operations still need to be added before claiming that app data is saved in MongoDB.

## Algorithms
- **Greedy:** processes requests in order and selects the lowest-cost compatible available space.
- **Hungarian:** finds a minimum-cost assignment for a batch using a cost matrix and dummy columns for vehicles that cannot be assigned.
- **Cost:** entrance distance plus penalties for unnecessary use of specialist spaces. Compatibility restrictions are enforced separately.

For the report, test both algorithms on identical datasets, repeat timing trials, and report measured results. Execution time on small datasets is noisy. The standard Hungarian algorithm is O(n^3) for a square matrix dimension n.

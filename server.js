/**
 * ENERLECTRA PCEI MVP - FINAL PRODUCTION SERVER
 * NO AWS - NO REDIS - NO COMPLEXITY
 * Includes stubs, better logging, prettier console output
 */

import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- CORS ---
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// --- In-memory data stores ---
const users = new Map();
const clusters = new Map();
const contributions = new Map();
const energyLedger = [];
const suppliers = new Map();
const products = new Map();

// --- Helper: Error handler wrapper ---
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- Seed Zambian demo data ---
function seedZambianData() {
  const clusterNames = [
    "Lusaka Central",
    "Kabwe Central",
    "Ndola Central",
    "Livingstone",
    "Chipata Central"
  ];
  const provinces = ["Lusaka", "Central", "Copperbelt", "Southern", "Eastern"];
  const lats = [-15.4167, -14.4469, -12.9587, -17.8419, -13.6430];
  const lons = [28.2833, 28.4464, 28.6366, 25.8544, 32.6464];

  clusterNames.forEach((name, i) => {
    const clusterId = `C00${i + 1}`;
    clusters.set(clusterId, {
      id: clusterId,
      name: `${name} Energy Hub`,
      constituency: name,
      province: provinces[i],
      lat: lats[i],
      lon: lons[i],
      members: [],
      totalContributions: 0,
      totalEnergy: 0,
      status: "forming",
      createdAt: Date.now(),
      fundingTarget: 5900000
    });
  });

  // Seed users
  ["0977000001", "0977000002", "0977000003"].forEach((phone, i) => {
    const roles = ["Prosumer", "Prosumer", "Consumer"];
    const clusterIds = ["C001", "C002", "C001"];
    const userId = `USER#${roles[i] === "Prosumer" ? "P" : "C"}${10 + i}`;
    users.set(userId, {
      userId,
      phoneNumber: phone,
      name: `Test ${roles[i]} ${10 + i}`,
      role: roles[i],
      clusterId: clusterIds[i],
      energy: {
        available: roles[i] === "Prosumer" ? 100 + i * 50 : 0,
        locked: 0
      },
      money: {
        available: 300 + i * 200,
        locked: 0
      }
    });

    const cluster = clusters.get(clusterIds[i]);
    if (cluster) cluster.members.push(userId);
  });

  // Seed suppliers
  ["Jinko Zambia", "Huawei Energy ZM", "Sun King Zambia"].forEach(
    (name, i) => {
      const supId = `SUP00${i + 1}`;
      suppliers.set(supId, {
        id: supId,
        name,
        contact: `contact@${name.toLowerCase().replace(/\s+/g, "")}.zm`
      });
    }
  );

  // Seed products
  [
    {
      id: "PROD001",
      supplierId: "SUP001",
      type: "solar_panel",
      name: "Jinko 400W Mono Panel",
      price: 3500,
      warranty: 25
    },
    {
      id: "PROD002",
      supplierId: "SUP002",
      type: "inverter",
      name: "Huawei 5kW Hybrid Inverter",
      price: 8500,
      warranty: 10
    },
    {
      id: "PROD003",
      supplierId: "SUP003",
      type: "battery",
      name: "Sun King 10kWh Lithium",
      price: 28000,
      warranty: 10
    }
  ].forEach(p => products.set(p.id, p));

  console.log(
    `✅ Seeded ${clusters.size} clusters, ${users.size} users, ${suppliers.size} suppliers, ${products.size} products`
  );
}

// --- Real endpoints ---
app.get(
  "/api/v1/clusters",
  asyncHandler(async (req, res) => {
    const list = Array.from(clusters.values()).map(c => ({
      id: c.id,
      name: c.name,
      constituency: c.constituency,
      province: c.province,
      members: c.members.length,
      totalContributions: c.totalContributions,
      fundingProgress:
        ((c.totalContributions / c.fundingTarget) * 100).toFixed(1) + "%"
    }));
    res.json({ status: "success", data: { clusters: list } });
  })
);

app.get(
  "/api/v1/clusters/:id",
  asyncHandler(async (req, res) => {
    const cluster = clusters.get(req.params.id);
    if (!cluster) {
      return res
        .status(404)
        .json({ status: "error", message: "Cluster not found" });
    }

    const members = cluster.members
      .map(id => {
        const u = users.get(id);
        return u
          ? {
              userId: u.userId,
              name: u.name,
              role: u.role,
              energy: u.energy.available
            }
          : null;
      })
      .filter(Boolean);

    res.json({ status: "success", data: { cluster, members } });
  })
);

app.post(
  "/api/v1/clusters/:id/join",
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const cluster = clusters.get(req.params.id);
    const user = users.get(userId);

    if (!cluster || !user) {
      return res
        .status(404)
        .json({ status: "error", message: "Cluster or user not found" });
    }
    if (cluster.members.includes(userId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Already a member" });
    }

    cluster.members.push(userId);
    user.clusterId = cluster.id;

    console.log(`[JOIN] User ${userId} joined cluster ${cluster.id}`);
    res.json({
      status: "success",
      data: {
        message: "Joined successfully",
        totalMembers: cluster.members.length
      }
    });
  })
);

app.get(
  "/api/v1/user/:userId/balance",
  asyncHandler(async (req, res) => {
    const user = users.get(req.params.userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: "error", message: "User not found" });
    }

    res.json({
      status: "success",
      data: {
        userId: user.userId,
        name: user.name,
        balances: {
          energy: {
            available: user.energy.available,
            locked: user.energy.locked,
            total: user.energy.available + user.energy.locked
          },
          money: {
            available: user.money.available,
            locked: user.money.locked,
            total: user.money.available + user.money.locked
          }
        }
      }
    });
  })
);

app.post(
  "/api/v1/device/report",
  asyncHandler(async (req, res) => {
    const { deviceId, value_kWh, userId } = req.body;
    const user = users.get(userId);

    if (!deviceId || !value_kWh || !user) {
      return res
        .status(400)
        .json({ status: "error", message: "Missing fields or user" });
    }
    if (user.role !== "Prosumer") {
      return res
        .status(400)
        .json({ status: "error", message: "Only prosumers can report" });
    }

    const amount = parseFloat(value_kWh);
    user.energy.available += amount;

    const cluster = clusters.get(user.clusterId);
    if (cluster) cluster.totalEnergy += amount;

    energyLedger.push({
      timestamp: Date.now(),
      type: "generation",
      userId,
      deviceId,
      amount
    });
    console.log(`[ENERGY] User ${userId} reported ${amount} kWh`);

    res.json({
      status: "success",
      data: {
        energyGenerated: amount,
        newBalance: user.energy.available,
        carbonSaved: (amount * 0.8).toFixed(2)
      }
    });
  })
);

app.get(
  "/api/v1/ledger",
  asyncHandler(async (req, res) => {
    res.json({
      status: "success",
      data: { transactions: energyLedger.slice(-50).reverse() }
    });
  })
);

app.post(
  "/api/v1/contributions",
  asyncHandler(async (req, res) => {
    const { userId, clusterId, amount } = req.body;
    const user = users.get(userId);
    const cluster = clusters.get(clusterId);

    if (!user || !cluster) {
      return res
        .status(404)
        .json({ status: "error", message: "User or cluster not found" });
    }

    const contribAmount = parseFloat(amount);
    if (user.money.available < contribAmount) {
      return res
        .status(400)
        .json({ status: "error", message: "Insufficient funds" });
    }

    user.money.available -= contribAmount;
    cluster.totalContributions += contribAmount;

    const contribId = `CONTRIB_${Date.now()}`;
    contributions.set(contribId, {
      id: contribId,
      userId,
      clusterId,
      amount: contribAmount,
      timestamp: Date.now()
    });
    energyLedger.push({
      timestamp: Date.now(),
      type: "contribution",
      userId,
      amount: contribAmount,
      cluster: clusterId
    });

    console.log(
      `[CONTRIBUTION] User ${userId} contributed ${contribAmount} to ${clusterId}`
    );
    res.json({
      status: "success",
      data: {
        contributionId: contribId,
        amount: contribAmount,
        newClusterTotal: cluster.totalContributions,
        fundingProgress:
          ((cluster.totalContributions / cluster.fundingTarget) * 100).toFixed(
            1
          ) + "%"
      }
    });
  })
);

app.get(
  "/api/v1/contributions/history/:userId",
  asyncHandler(async (req, res) => {
    const userContribs = Array.from(contributions.values()).filter(
      c => c.userId === req.params.userId
    );
    res.json({
      status: "success",
      data: {
        contributions: userContribs,
        total: userContribs.reduce((s, c) => s + c.amount, 0)
      }
    });
  })
);

app.get(
  "/api/v1/marketplace",
  asyncHandler(async (req, res) => {
    const { type } = req.query;
    let list = Array.from(products.values());
    if (type) list = list.filter(p => p.type === type);
    const productsWithSuppliers = list.map(p => ({
      ...p,
      supplier: suppliers.get(p.supplierId)?.name || "Unknown"
    }));
    res.json({
      status: "success",
      data: { products: productsWithSuppliers, total: productsWithSuppliers.length }
    });
  })
);

app.get(
  "/api/v1/map",
  asyncHandler(async (req, res) => {
    const mapData = Array.from(clusters.values()).map(c => ({
      id: c.id,
      name: c.name,
      constituency: c.constituency,
      province: c.province,
      coordinates: { lat: c.lat, lon: c.lon },
      members: c.members.length,
      totalEnergy: c.totalEnergy,
      fundingProgress:
        ((c.totalContributions / c.fundingTarget) * 100).toFixed(1) + "%",
      status: c.status
    }));
    res.json({
      status: "success",
      data: { clusters: mapData, total: mapData.length }
    });
  })
);

// --- HEALTH CHECK ---
app.get(
  "/api/v1/health",
  asyncHandler(async (req, res) => {
    res.json({
      status: "OK",
      features: [
        "Cluster",
        "Wallet",
        "Ledger",
        "Contributions",
        "Marketplace",
        "Map"
      ],
      stats: { users: users.size, clusters: clusters.size }
    });
  })
);

// --- STUBBED ENDPOINTS (frontend expects) ---
const stub = async data =>
  new Promise(resolve => setTimeout(() => resolve({ data }), 60));

app.post(
  "/api/v1/login/start",
  asyncHandler(async (req, res) =>
    res.json(await stub({ success: true, token: "mvp-login" }))
  )
);
app.post(
  "/api/v1/login/verify",
  asyncHandler(async (req, res) =>
    res.json(await stub({ success: true, token: "mvp-login" }))
  )
);
app.get(
  "/api/v1/profile",
  asyncHandler(async (req, res) =>
    res.json(
      await stub({
        userId: "USER1",
        name: "MVP User",
        role: "Prosumer",
        balances: { money: 200, energy: 50 }
      })
    )
  )
);
app.get(
  "/api/v1/user/:userId",
  asyncHandler(async (req, res) =>
    res.json(
      await stub({ userId: req.params.userId, name: "MVP User" })
    )
  )
);
app.get(
  "/api/v1/transactions",
  asyncHandler(async (req, res) => res.json(await stub([])))
);
app.post(
  "/api/v1/add-funds",
  asyncHandler(async (req, res) =>
    res.json(await stub({ success: true }))
  )
);
app.post(
  "/api/v1/blockchain-trade",
  asyncHandler(async (req, res) =>
    res.json(await stub({ success: true }))
  )
);
app.post(
  "/api/v1/mobile-money-trade",
  asyncHandler(async (req, res) =>
    res.json(await stub({ success: true }))
  )
);
app.post(
  "/api/v1/connect-wallet",
  asyncHandler(async (req, res) =>
    res.json(await stub({ connected: true }))
  )
);
app.get(
  "/api/v1/blockchain-balance",
  asyncHandler(async (req, res) =>
    res.json(await stub({ balance: 0 }))
  )
);
app.get(
  "/api/v1/market-insights",
  asyncHandler(async (req, res) =>
    res.json(await stub({ insights: [] }))
  )
);
app.post(
  "/api/v1/ai-assist",
  asyncHandler(async (req, res) =>
    res.json(await stub({ response: "AI disabled for MVP" }))
  )
);

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message || err);
  res
    .status(500)
    .json({ status: "error", message: err.message || "Internal Server Error" });
});

// --- Start server ---
seedZambianData();
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log(`⚡ ENERLECTRA MVP RUNNING ON PORT ${PORT}`);
  console.log("=".repeat(60));
  console.log("📊 TEST ENDPOINTS:");
  console.log("  GET  http://localhost:3000/api/v1/health");
  console.log("  GET  http://localhost:3000/api/v1/clusters");
  console.log("  GET  http://localhost:3000/api/v1/map");
  console.log("=".repeat(60));
});

server.on("error", error =>
  console.error("❌ Server error:", error.message)
);

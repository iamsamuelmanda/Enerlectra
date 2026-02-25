const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');
if (content.includes('exchangerate-api.com')) {
  console.log('Already patched.'); process.exit(0);
}
const newEndpoints = `
  // ── Live Exchange Rate ─────────────────────────────────────────
  let _rateCache = { rate: 27.5, ts: 0, from: '', to: '' };
  app.get("/api/v1/exchange-rate/:from/:to", async (req, res) => {
    const { from, to } = req.params;
    const now = Date.now();
    if (now - _rateCache.ts < 600000 && _rateCache.from === from && _rateCache.to === to) {
      return res.json({ status: "success", from, to, rate: _rateCache.rate, cached: true });
    }
    try {
      const apiKey = process.env.EXCHANGE_RATE_API_KEY;
      const resp = await fetch(\`https://v6.exchangerate-api.com/v6/\${apiKey}/latest/\${from}\`);
      const data = await resp.json();
      if (data.result !== "success") throw new Error(data["error-type"] || "API error");
      const rate = data.conversion_rates[to];
      if (!rate) throw new Error("No rate for " + to);
      _rateCache = { from, to, rate, ts: now };
      return res.json({ status: "success", from, to, rate, last_updated: data.time_last_update_utc });
    } catch (err) {
      return res.json({ status: "success", from, to, rate: _rateCache.rate, fallback: true });
    }
  });
  // ── Cluster Participants ───────────────────────────────────────
  app.get("/api/v1/clusters/:id/participants", (req, res) => {
    const clusterId = req.params.id;
    const clusterContribs = Array.from(contributions.values()).filter(c => c.clusterId === clusterId);
    const userMap = {};
    clusterContribs.forEach(c => {
      const key = c.userId || c.contributor_id || 'anonymous';
      if (!userMap[key]) userMap[key] = { userId: key, userName: c.userName || key, pcus: 0, contributionCount: 0, firstContributionAt: c.createdAt || new Date().toISOString() };
      userMap[key].pcus += (c.pcus ?? 0);
      userMap[key].contributionCount++;
    });
    const totalPCUs = Object.values(userMap).reduce((s, u) => s + u.pcus, 0);
    const participants = Object.values(userMap).map(u => ({ ...u, ownershipPct: totalPCUs > 0 ? (u.pcus / totalPCUs) * 100 : 0, kwhPerMonth: (u.pcus / 100) * 0.8 })).sort((a, b) => b.pcus - a.pcus);
    res.json({ status: "success", data: { participants } });
  });
  // ── Validate Contribution ──────────────────────────────────────
  app.post("/api/v1/contributions/validate", (req, res) => {
    const { userId, clusterId, amountUSD } = req.body;
    if (!amountUSD || amountUSD < 1 || amountUSD > 1000) return res.json({ status: "success", data: { allowed: false, errorCode: "INVALID_AMOUNT", errorMessage: "Amount must be between $1 and $1,000" }});
    const clusterContribs = Array.from(contributions.values()).filter(c => c.clusterId === clusterId);
    const totalPCUs = clusterContribs.reduce((s, c) => s + (c.pcus ?? 0), 0);
    const userPCUs = clusterContribs.filter(c => (c.userId || c.contributor_id) === userId).reduce((s, c) => s + (c.pcus ?? 0), 0);
    const newPCUs = amountUSD * 100;
    const projOwnership = (totalPCUs + newPCUs) > 0 ? ((userPCUs + newPCUs) / (totalPCUs + newPCUs)) * 100 : 100;
    if (projOwnership > 30) return res.json({ status: "success", data: { allowed: false, errorCode: "WHALE_LIMIT", errorMessage: "This would give you " + projOwnership.toFixed(1) + "% ownership (max 30%)", details: { projectedOwnershipPct: projOwnership, maxAllowedUSD: Math.max(0, Math.floor(((totalPCUs * 0.3) - userPCUs) / 100)) }}});
    return res.json({ status: "success", data: { allowed: true, details: { projectedOwnershipPct: projOwnership }}});
  });
`;
content = content.replace(/origin:\s*["']\*["']/g, `origin: process.env.CORS_ORIGIN || "https://enerlectra-frontend.vercel.app"`);
const errorHandlerPattern = /app\.use\(\s*\(err,\s*req,\s*res,\s*next\)/;
if (errorHandlerPattern.test(content)) {
  content = content.replace(errorHandlerPattern, newEndpoints + '\napp.use((err, req, res, next)');
} else {
  content = content.replace(/const server = app\.listen/, newEndpoints + '\nconst server = app.listen');
}
fs.writeFileSync(serverPath, content, 'utf8');
console.log('server.js patched successfully');

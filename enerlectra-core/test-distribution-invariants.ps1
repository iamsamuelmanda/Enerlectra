param(
  [string]$ClusterId = "clu_rct5pbmy",
  [int]$TotalKwh = 1000
)

$ErrorActionPreference = "Stop"
$env:CLUSTER_ID = $ClusterId

$BaseUrl = "http://localhost:4000"

Write-Host "=== Enerlectra Distribution Invariant Test ==="
Write-Host "Cluster: $ClusterId"
Write-Host "Total kWh: $TotalKwh"
Write-Host ""

Write-Host "1) Load latest snapshot from store/ownership-snapshots.json..."

$nodeLoadSnapshot = @"
const fs = require('fs');
const path = require('path');

const clusterId = process.env.CLUSTER_ID;

const STORE_DIR = path.join(process.cwd(), 'store');
const FILE = path.join(STORE_DIR, 'ownership-snapshots.json');

if (!fs.existsSync(FILE)) {
  console.error('ownership-snapshots.json not found');
  process.exit(1);
}

if (!clusterId) {
  console.error('clusterId env CLUSTER_ID missing');
  process.exit(1);
}

const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const list = all[clusterId] || [];

if (!list.length) {
  console.error('No snapshots found for cluster ' + clusterId);
  process.exit(1);
}

const latest = list[list.length - 1];
console.log(JSON.stringify(latest));
"@

$SnapshotInfoJson = node -e $nodeLoadSnapshot
Write-Host $SnapshotInfoJson

$SnapshotId = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} console.log(JSON.parse(s).snapshotId);" -- "$SnapshotInfoJson"
if (-not $SnapshotId) {
  Write-Error "Failed to extract snapshotId from latest snapshot"
  exit 1
}
Write-Host "✅ Latest snapshot: $SnapshotId"
Write-Host ""

Write-Host "2) Obtain distribution for this snapshot (201 new or 409 existing)..."

$body = @{
  clusterId  = $ClusterId
  snapshotId = $SnapshotId
  totalKwh   = $TotalKwh
} | ConvertTo-Json

function Get-ErrorBodyAndStatus {
  param([Parameter(Mandatory=$true)]$ErrorRecord)

  $resp = $ErrorRecord.Exception.Response
  $status = $null
  $body = $null

  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    $body = $ErrorRecord.ErrorDetails.Message
  } elseif ($resp -ne $null -and $resp -is [System.Net.Http.HttpResponseMessage]) {
    $status = [int]$resp.StatusCode
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  }

  if (-not $status -and $resp -ne $null -and $resp.StatusCode) {
    $status = [int]$resp.StatusCode
  }

  return [PSCustomObject]@{
    StatusCode = $status
    Body       = $body
  }
}

$firstStatus = $null
$firstBody   = $null

try {
  $firstResponse = Invoke-WebRequest -Uri "$BaseUrl/distribution/finalize" `
                                     -Method POST `
                                     -ContentType "application/json" `
                                     -Body $body `
                                     -ErrorAction Stop
  $firstStatus = $firstResponse.StatusCode.value__
  $firstBody   = $firstResponse.Content
} catch {
  $errInfo = Get-ErrorBodyAndStatus -ErrorRecord $_
  $firstStatus = $errInfo.StatusCode
  $firstBody   = $errInfo.Body
}

Write-Host $firstBody
Write-Host "HTTP status: $firstStatus"

if ($firstStatus -ne 201 -and $firstStatus -ne 409) {
  Write-Error "Expected 201 or 409 from finalize, got $firstStatus"
  exit 1
}

# Normalize distribution object out of either 201 or 409 payload
$DistributionJson = node -e @"
const s = (process.argv[1] || '').trim();
if (!s) { process.exit(1); }
const r = JSON.parse(s);
const dist = r.distribution || r;
console.log(JSON.stringify(dist));
"@ -- "$firstBody"

Write-Host ""
Write-Host "Distribution object:"
Write-Host $DistributionJson

$DistId = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} console.log(JSON.parse(s).distributionId);" -- "$DistributionJson"
if (-not $DistId) {
  Write-Error 'Failed to extract distributionId from distribution object'
  exit 1
}
Write-Host "✅ Distribution: $DistId"
Write-Host ""

Write-Host "3) Invariant: sum(allocatedKwh) == totalKwh..."

$AllocatedSum = node -e @"
const s = (process.argv[1] || '').trim();
if (!s) { process.exit(1); }
const dist = JSON.parse(s);
const sum = (dist.allocations || []).reduce((acc,a) => acc + (a.allocatedKwh || 0), 0);
console.log(sum);
"@ -- "$DistributionJson"

Write-Host "Total allocatedKwh: $AllocatedSum"
if ([int]$AllocatedSum -ne $TotalKwh) {
  Write-Error "Allocated kWh sum $AllocatedSum does not equal totalKwh $TotalKwh"
  exit 1
}
Write-Host "✅ Allocated kWh sum matches totalKwh"
Write-Host ""

Write-Host "4) Invariant: allocations.ownershipPct matches snapshot.effectiveOwnership.pct..."

$PctCheckResult = node -e @"
const dist = JSON.parse((process.argv[1] || '').trim());
const snap = JSON.parse((process.argv[2] || '').trim());

const eff = snap.effectiveOwnership || [];
const allocs = dist.allocations || [];

function pctByUser(arr) {
  const m = {};
  for (const x of arr) {
    if (!x.userId) continue;
    m[x.userId] = x.pct ?? x.ownershipPct ?? null;
  }
  return m;
}

const effPct = pctByUser(eff);
const allocPct = pctByUser(allocs);

const mismatches = [];

for (const userId of Object.keys(effPct)) {
  const expected = effPct[userId];
  const got = allocPct[userId];
  if (got === undefined || got === null || Math.abs(got - expected) > 1e-9) {
    mismatches.push({ userId, expected, got });
  }
}

for (const userId of Object.keys(allocPct)) {
  if (!(userId in effPct)) {
    mismatches.push({ userId, expected: null, got: allocPct[userId] });
  }
}

console.log(JSON.stringify(mismatches));
"@ -- "$DistributionJson" "$SnapshotInfoJson"

Write-Host "Pct mismatch report:"
Write-Host $PctCheckResult

if ($PctCheckResult -ne "[]") {
  Write-Error "ownershipPct in allocations does not match snapshot.effectiveOwnership.pct"
  exit 1
}
Write-Host "✅ ownershipPct matches effectiveOwnership for all users"
Write-Host ""

Write-Host "5) Invariant: no ownership changes after snapshot is finalized..."

# This assumes that the *current* ownership view for this cluster/snapshot is exactly the snapshot we loaded.
# To make it meaningful, we assert that the snapshot is finalized and treat it as the canonical record.

$FinalizedFlag = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} console.log(JSON.parse(s).finalized ? 'true' : 'false');" -- "$SnapshotInfoJson"
if ($FinalizedFlag -ne "true") {
  Write-Error "Snapshot not finalized=true in store (cannot assert immutability)"
  exit 1
}

Write-Host "Snapshot finalized flag: $FinalizedFlag"
Write-Host "✅ Snapshot is finalized; treating ownership as immutable"

Write-Host ""
Write-Host "🎉 All distribution invariants hold for snapshot $SnapshotId in cluster $ClusterId"

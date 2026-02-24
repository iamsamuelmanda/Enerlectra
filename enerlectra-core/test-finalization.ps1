param(
  [string]$ClusterId = "clu_rct5pbmy",  # Kabwe Solar Cluster A by default
  [int]$TotalKwh = 1000
)

$ErrorActionPreference = "Stop"

$env:CLUSTER_ID = $ClusterId

$BaseUrl = "http://localhost:4000"

Write-Host "=== Enerlectra Finalization Invariant Test ==="
Write-Host "Cluster: $ClusterId"
Write-Host "Total kWh: $TotalKwh"
Write-Host ""

Write-Host "1) Loading latest snapshot for cluster from store/ownership-snapshots.json..."

$nodeScript1 = @"
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

$SnapshotInfoJson = node -e $nodeScript1
Write-Host $SnapshotInfoJson

$SnapshotId = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} console.log(JSON.parse(s).snapshotId);" -- "$SnapshotInfoJson"
if (-not $SnapshotId) {
  Write-Error "Failed to extract snapshotId from latest snapshot"
  exit 1
}
Write-Host "✅ Latest snapshot: $SnapshotId"
Write-Host ""

Write-Host "2) First finalize call – allow 201 (new) OR 409 (already exists)..."

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
    # PowerShell 7+ often puts raw JSON string here
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

$firstResponse = $null
$firstStatus   = $null
$firstBody     = $null

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
Write-Host "HTTP status (first): $firstStatus"

if ($firstStatus -ne 201 -and $firstStatus -ne 409) {
  Write-Error "Expected 201 or 409 on first finalize, got $firstStatus"
  exit 1
}

# Extract distributionId regardless of 201 vs 409
$DistId = node -e @"
const s = (process.argv[1] || '').trim();
if (!s) { process.exit(1); }
const r = JSON.parse(s);
const dist = r.distribution || r;
if (!dist.distributionId) { process.exit(1); }
console.log(dist.distributionId);
"@ -- "$firstBody"

if (-not $DistId) {
  Write-Error "Failed to extract distributionId from first finalize"
  exit 1
}

if ($firstStatus -eq 201) {
  Write-Host "✅ First finalize created distribution: $DistId"
} else {
  Write-Host "ℹ️ Distribution already existed for this snapshot: $DistId"
}
Write-Host ""

Write-Host "3) Second finalize call (same snapshot) – must REJECT (409) and return SAME distribution..."

$secondResponse = $null
$secondStatus   = $null
$secondBody     = $null

try {
  $secondResponse = Invoke-WebRequest -Uri "$BaseUrl/distribution/finalize" `
                                      -Method POST `
                                      -ContentType "application/json" `
                                      -Body $body `
                                      -ErrorAction Stop
  $secondStatus = $secondResponse.StatusCode.value__
  $secondBody   = $secondResponse.Content
} catch {
  $errInfo = Get-ErrorBodyAndStatus -ErrorRecord $_
  $secondStatus = $errInfo.StatusCode
  $secondBody   = $errInfo.Body
}

Write-Host $secondBody
Write-Host "HTTP status (second): $secondStatus"

if ($secondStatus -ne 409) {
  Write-Error "Expected 409 on second finalize, got $secondStatus"
  exit 1
}

$DistId2 = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} const r = JSON.parse(s); console.log(r.distribution?.distributionId || '');" -- "$secondBody"
if (-not $DistId2) {
  Write-Error "Failed to extract existing distributionId from second finalize payload"
  exit 1
}

if ($DistId -ne $DistId2) {
  Write-Error "Invariant broken: second call returned different distributionId (first=$DistId, second=$DistId2)"
  exit 1
}
Write-Host "✅ Second finalize is idempotent: same distributionId $DistId2"
Write-Host ""

Write-Host "4) Verify snapshot is marked finalized in store..."

$nodeScript2 = @"
const fs = require('fs');
const path = require('path');

const clusterId = process.env.CLUSTER_ID;
const snapshotId = process.env.SNAPSHOT_ID;

const STORE_DIR = path.join(process.cwd(), 'store');
const FILE = path.join(STORE_DIR, 'ownership-snapshots.json');

if (!fs.existsSync(FILE)) {
  console.error('ownership-snapshots.json not found');
  process.exit(1);
}

if (!clusterId || !snapshotId) {
  console.error('Missing CLUSTER_ID or SNAPSHOT_ID env');
  process.exit(1);
}

const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const list = all[clusterId] || [];
const found = list.find(s => s.snapshotId === snapshotId);

if (!found) {
  console.error('Snapshot not found in store');
  process.exit(1);
}

console.log(JSON.stringify(found));
"@

$env:SNAPSHOT_ID = $SnapshotId
$SnapshotRecordJson = node -e $nodeScript2
Write-Host $SnapshotRecordJson

$FinalizedFlag = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} console.log(JSON.parse(s).finalized ? 'true' : 'false');" -- "$SnapshotRecordJson"
if ($FinalizedFlag -ne "true") {
  Write-Error "Snapshot not marked finalized=true in store"
  exit 1
}

Write-Host "✅ Snapshot is locked (finalized=true)"
Write-Host ""
Write-Host "🎉 All finalization invariants hold for snapshot $SnapshotId in cluster $ClusterId"

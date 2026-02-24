param(
  [int]$TotalKwh = 1000
)

$ErrorActionPreference = "Stop"

Write-Host "=== Enerlectra Full Invariant Test Suite ==="
Write-Host "Total kWh (for finalize tests): $TotalKwh"
Write-Host ""

# ------------------------------------------------------------
# Common: load snapshot store
# ------------------------------------------------------------

$storePath = Join-Path (Get-Location) "store\ownership-snapshots.json"
if (-not (Test-Path $storePath)) {
  Write-Error "ownership-snapshots.json not found at $storePath"
  exit 1
}

$json = Get-Content $storePath -Raw
$all  = $json | ConvertFrom-Json

$clusters = $all.PSObject.Properties.Name
Write-Host "Clusters found in store: $($clusters -join ', ')"
Write-Host ""

# ------------------------------------------------------------
# 1) Snapshot invariants (totals, ordering, finalized flag)
# ------------------------------------------------------------

Write-Host "=== 1) Snapshot invariants ==="
Write-Host ""

foreach ($clusterId in $clusters) {
  Write-Host ">>> Cluster: $clusterId"
  $snapshots = $all.$clusterId

  if (-not $snapshots -or $snapshots.Count -eq 0) {
    Write-Error "No snapshots for cluster $clusterId"
    exit 1
  }

  # 1.1 Totals sanity for every snapshot
  foreach ($snap in $snapshots) {
    $sid = $snap.snapshotId
    $eff = $snap.effectiveOwnership
    $tot = $snap.totals

    if (-not $eff) {
      Write-Error "Snapshot $sid in $clusterId has no effectiveOwnership"
      exit 1
    }

    $sumUnits = ($eff | Measure-Object -Property units -Sum).Sum
    $sumPct   = ($eff | Measure-Object -Property pct   -Sum).Sum

    if ($sumUnits -ne $tot.totalEffectiveUnits) {
      Write-Error ("Snapshot {0} in {1}: sum(effectiveOwnership.units)={2} != totals.totalEffectiveUnits={3}" -f $sid, $clusterId, $sumUnits, $tot.totalEffectiveUnits)
      exit 1
    }

    if ([math]::Abs($sumPct - 100) -gt 1e-9) {
      Write-Error ("Snapshot {0} in {1}: sum(effectiveOwnership.pct)={2} != 100" -f $sid, $clusterId, $sumPct)
      exit 1
    }

    # Units and pct ranges (extra sanity)
    foreach ($o in $eff) {
      if ($o.units -lt 0) {
        Write-Error ("Snapshot {0} in {1}: user {2} has negative units {3}" -f $sid, $clusterId, $o.userId, $o.units)
        exit 1
      }
      if ($o.pct -lt 0 -or $o.pct -gt 100) {
        Write-Error ("Snapshot {0} in {1}: user {2} has pct {3} outside [0,100]" -f $sid, $clusterId, $o.userId, $o.pct)
        exit 1
      }
    }
  }

  Write-Host "✅ Totals sanity holds for all snapshots in $clusterId"

  # 1.2 Cross-snapshot monotonicity:
  #     - version strictly increasing
  #     - generatedAt non-decreasing (no time travel)
  $versions    = @()
  $timestamps  = @()

  foreach ($snap in $snapshots) {
    $versions   += $snap.version
    $timestamps += [datetime]::Parse($snap.generatedAt)
  }

  for ($i = 1; $i -lt $versions.Count; $i++) {
    if ($versions[$i] -le $versions[$i-1]) {
      Write-Error ("Cluster {0}: version not strictly increasing at index {1} (prev={2}, curr={3})" -f $clusterId, $i, $versions[$i-1], $versions[$i])
      exit 1
    }
    if ($timestamps[$i] -lt $timestamps[$i-1]) {
      Write-Error ("Cluster {0}: generatedAt went backwards at index {1} (prev={2}, curr={3})" -f $clusterId, $i, $timestamps[$i-1], $timestamps[$i])
      exit 1
    }
  }

  Write-Host "✅ Cross-snapshot monotonicity holds (version strictly ↑, generatedAt non-decreasing) in $clusterId"

  # 1.3 Latest snapshot must be finalized=true
  $latest = $snapshots[$snapshots.Count - 1]
  if (-not $latest.finalized) {
    Write-Error ("Latest snapshot {0} in {1} is not finalized=true; finalize should be disallowed for non-final ownership" -f $latest.snapshotId, $clusterId)
    exit 1
  }

  Write-Host ("✅ Latest snapshot {0} is finalized=true in {1} (finalize allowed only in finalized state)" -f $latest.snapshotId, $clusterId)
  Write-Host ""
}

# ------------------------------------------------------------
# 2) Distribution & finalize invariants (per cluster)
# ------------------------------------------------------------

$BaseUrl = "http://localhost:4000"

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

Write-Host "=== 2) Distribution & finalize invariants ==="
Write-Host ""

foreach ($clusterId in $clusters) {
  Write-Host ">>> Cluster: $clusterId"

  $env:CLUSTER_ID = $clusterId
  $snapshots = $all.$clusterId
  $latest = $snapshots[$snapshots.Count - 1]
  $SnapshotId = $latest.snapshotId

  Write-Host "Latest snapshot: $SnapshotId"

  # 2.1 Finalization invariants (idempotent finalize, one distribution per snapshot)
  Write-Host "  - Finalization invariants (latest snapshot)..."

  $body = @{
    clusterId  = $clusterId
    snapshotId = $SnapshotId
    totalKwh   = $TotalKwh
  } | ConvertTo-Json

  # First finalize call: allow 201 (fresh) or 409 (already exists)
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

  if ($firstStatus -ne 201 -and $firstStatus -ne 409) {
    Write-Error ("Cluster {0}: expected 201 or 409 on first finalize, got {1}" -f $clusterId, $firstStatus)
    exit 1
  }

  # Extract distribution object
  $DistributionJson = node -e @"
const s = (process.argv[1] || '').trim();
if (!s) { process.exit(1); }
const r = JSON.parse(s);
const dist = r.distribution || r;
console.log(JSON.stringify(dist));
"@ -- "$firstBody"

  $DistId = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} console.log(JSON.parse(s).distributionId);" -- "$DistributionJson"
  if (-not $DistId) {
    Write-Error ("Cluster {0}: failed to extract distributionId from first finalize" -f $clusterId)
    exit 1
  }

  # Second finalize must be 409 and return same DistId
  $secondStatus = $null
  $secondBody   = $null

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

  if ($secondStatus -ne 409) {
    Write-Error ("Cluster {0}: expected 409 on second finalize, got {1}" -f $clusterId, $secondStatus)
    exit 1
  }

  $DistId2 = node -e "const s=(process.argv[1]||'').trim(); if(!s){process.exit(1);} const r = JSON.parse(s); console.log(r.distribution?.distributionId || '');" -- "$secondBody"
  if (-not $DistId2) {
    Write-Error ("Cluster {0}: failed to extract distributionId from second finalize" -f $clusterId)
    exit 1
  }

  if ($DistId -ne $DistId2) {
    Write-Error ("Cluster {0}: finalize not idempotent (first={1}, second={2})" -f $clusterId, $DistId, $DistId2)
    exit 1
  }

  Write-Host ("    ✅ Finalize idempotent for latest snapshot (distributionId {0})" -f $DistId)

  # 2.2 Distribution invariants (sum kWh, pct match snapshot, unit granularity)
  Write-Host "  - Distribution invariants (latest snapshot)..."

  # DistributionJson already holds the normalized distribution
  $AllocatedSum = node -e @"
const s = (process.argv[1] || '').trim();
if (!s) { process.exit(1); }
const dist = JSON.parse(s);
const sum = (dist.allocations || []).reduce((acc,a) => acc + (a.allocatedKwh || 0), 0);
console.log(sum);
"@ -- "$DistributionJson"

  if ([int]$AllocatedSum -ne $TotalKwh) {
    Write-Error ("Cluster {0}: allocated kWh sum {1} != totalKwh {2}" -f $clusterId, $AllocatedSum, $TotalKwh)
    exit 1
  }

  # ownershipPct vs effectiveOwnership.pct
  $SnapshotInfoJson = ($snapshots[$snapshots.Count - 1] | ConvertTo-Json -Depth 10)

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

  if ($PctCheckResult -ne "[]") {
    Write-Error ("Cluster {0}: ownershipPct in allocations does not match snapshot.effectiveOwnership.pct (mismatches={1})" -f $clusterId, $PctCheckResult)
    exit 1
  }

  # allocatedKwh integer / granularity check
  $GranularityCheck = node -e @"
const dist = JSON.parse((process.argv[1] || '').trim());
const allocs = dist.allocations || [];
for (const a of allocs) {
  const v = a.allocatedKwh;
  if (!Number.isInteger(v)) {
    console.log('non-integer');
    process.exit(0);
  }
}
console.log('ok');
"@ -- "$DistributionJson"

  if ($GranularityCheck -ne "ok") {
    Write-Error ("Cluster {0}: some allocatedKwh values are non-integer" -f $clusterId)
    exit 1
  }

  Write-Host "    ✅ Sum(allocatedKwh)==totalKwh, ownershipPct matches snapshot, allocatedKwh integers"

  # 2.3 No finalize on non-latest snapshots
  Write-Host "  - No finalize on non-latest snapshots..."

  if ($snapshots.Count -gt 1) {
    $oldSnap = $snapshots[0]
    $oldSnapshotId = $oldSnap.snapshotId

    $oldBody = @{
      clusterId  = $clusterId
      snapshotId = $oldSnapshotId
      totalKwh   = $TotalKwh
    } | ConvertTo-Json

    $oldStatus = $null
    $oldBodyResp = $null

    try {
      $oldResp = Invoke-WebRequest -Uri "$BaseUrl/distribution/finalize" `
                                   -Method POST `
                                   -ContentType "application/json" `
                                   -Body $oldBody `
                                   -ErrorAction Stop
      $oldStatus = $oldResp.StatusCode.value__
      $oldBodyResp = $oldResp.Content
    } catch {
      $errInfo = Get-ErrorBodyAndStatus -ErrorRecord $_
      $oldStatus = $errInfo.StatusCode
      $oldBodyResp = $errInfo.Body
    }

    if ($oldStatus -eq 201) {
      Write-Error ("Cluster {0}: finalize succeeded (201) on non-latest snapshot {1}, which should be forbidden" -f $clusterId, $oldSnapshotId)
      exit 1
    }

    Write-Host ("    ✅ Finalize rejected on non-latest snapshot {0} (status {1})" -f $oldSnapshotId, $oldStatus)
  } else {
    Write-Host "    ℹ️ Only one snapshot; non-latest finalize check not applicable"
  }

  Write-Host ""
}

# ------------------------------------------------------------
# 3) User-level invariants (basic cross-cluster sanity)
# ------------------------------------------------------------

Write-Host "=== 3) User-level cross-snapshot invariants ==="
Write-Host ""

# Build per-user aggregates using latest snapshot of each cluster
$userStats = @{}

foreach ($clusterId in $clusters) {
  $snapshots = $all.$clusterId
  $latest = $snapshots[$snapshots.Count - 1]
  foreach ($o in $latest.effectiveOwnership) {
    $uid = $o.userId
    if (-not $userStats.ContainsKey($uid)) {
      $userStats[$uid] = [PSCustomObject]@{
        UserId      = $uid
        TotalUnits  = 0
        Clusters    = @()
        Pcts        = @()
      }
    }
    $userStats[$uid].TotalUnits += $o.units
    $userStats[$uid].Clusters   += $clusterId
    $userStats[$uid].Pcts       += $o.pct
  }
}

# Simple global sanity: pct in [0,100], units non-negative already checked; here just report overview
foreach ($entry in $userStats.GetEnumerator()) {
  $u = $entry.Value
  if ($u.TotalUnits -lt 0) {
    Write-Error ("User {0}: negative TotalUnits {1} across clusters" -f $u.UserId, $u.TotalUnits)
    exit 1
  }
}

Write-Host "✅ User-level aggregates (basic checks) computed without violations"
Write-Host ""

Write-Host "🎉 All invariants (snapshots, distributions, finalize, user-level) hold for current data and API behaviour"

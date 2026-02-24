$ErrorActionPreference = "Stop"

Write-Host "=== Enerlectra Snapshot Invariant Test ==="
Write-Host ""

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

foreach ($clusterId in $clusters) {
  Write-Host ">>> Cluster: $clusterId"
  $snapshots = $all.$clusterId

  if (-not $snapshots -or $snapshots.Count -eq 0) {
    Write-Error "No snapshots for cluster $clusterId"
    exit 1
  }

  # 1) Totals sanity for every snapshot
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
  }

  Write-Host "✅ Totals sanity holds for all snapshots in $clusterId"

  # 2) Cross-snapshot monotonicity:
  #    - version strictly increasing
  #    - generatedAt non-decreasing (no time travel; equal timestamps allowed)
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

  # 3) No finalize on non-final ownership:
  #    latest snapshot must be finalized=true
  $latest = $snapshots[$snapshots.Count - 1]
  if (-not $latest.finalized) {
    Write-Error ("Latest snapshot {0} in {1} is not finalized=true; finalize should be disallowed for non-final ownership" -f $latest.snapshotId, $clusterId)
    exit 1
  }

  Write-Host ("✅ Latest snapshot {0} is finalized=true in {1} (finalize allowed only in finalized state)" -f $latest.snapshotId, $clusterId)
  Write-Host ""
}

Write-Host "🎉 All snapshot invariants hold for all clusters in ownership-snapshots.json"

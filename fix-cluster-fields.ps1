# ============================================================
#  Fix remaining cluster field references after schema alignment
#  Run from project root: .\fix-cluster-fields.ps1
# ============================================================

param([string]$ClientRoot = ".\client")
$src = Join-Path $ClientRoot "src"
$changed = @(); $skipped = @()

function Apply($filePath, $replacements) {
    if (-not (Test-Path $filePath)) { Write-Host "  ⚠ NOT FOUND: $filePath" -ForegroundColor Yellow; return }
    $original = Get-Content $filePath -Raw -Encoding UTF8
    $current = $original
    foreach ($r in $replacements) { $current = $current -replace [regex]::Escape($r.From), $r.To }
    if ($current -ne $original) {
        Set-Content -Path $filePath -Value $current -Encoding UTF8 -NoNewline
        $script:changed += $filePath
        Write-Host "  ✓ $($filePath.Replace($src,'src'))" -ForegroundColor Green
        foreach ($r in $replacements) {
            if ($original -match [regex]::Escape($r.From)) {
                Write-Host "      '$($r.From)' → '$($r.To)'" -ForegroundColor DarkGreen
            }
        }
    } else {
        $script:skipped += $filePath
    }
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Fix Cluster Field References" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

# ── CampaignProgress.tsx ─────────────────────────────────────
Apply "$src\features\campaign\components\CampaignProgress.tsx" @(
    @{ From = 'cluster.clusterId'; To = 'cluster.id' }
)

# ── ClusterCard.tsx ──────────────────────────────────────────
Apply "$src\features\clusters\components\ClusterCard.tsx" @(
    @{ From = 'cluster.clusterId';    To = 'cluster.id'       }
    @{ From = 'cluster.target_kW';    To = 'cluster.target_kw' }
    # Fix the statusColors index — both sides are optional, cast to string
    @{ From = 'statusColors[cluster.lifecycle_state ?? cluster.status] ?? statusColors[cluster.status]'
       To   = 'statusColors[(cluster.lifecycle_state ?? cluster.status) as string] ?? ""' }
)

# ── ClusterList.tsx ──────────────────────────────────────────
Apply "$src\features\clusters\components\ClusterList.tsx" @(
    @{ From = 'cluster.clusterId'; To = 'cluster.id' }
    @{ From = 'key={cluster.clusterId}'; To = 'key={cluster.id}' }
)

# ── ClusterView.tsx ──────────────────────────────────────────
Apply "$src\pages\ClusterView.tsx" @(
    @{ From = 'cluster.clusterId'; To = 'cluster.id'        }
    @{ From = 'cluster.target_kW'; To = 'cluster.target_kw' }
)

# ── PilotDashboard.tsx ───────────────────────────────────────
# CLUSTERS array already uses clusterId as the property name —
# but the value is a real DB id, so rename the property too
Apply "$src\features\admin\pages\PilotDashboard.tsx" @(
    @{ From = 'clusterId: ''clu_'; To = 'id: ''clu_' }
    @{ From = 'CLUSTERS[0].clusterId'; To = 'CLUSTERS[0].id' }
    @{ From = "useState(CLUSTERS[0].clusterId)"; To = "useState(CLUSTERS[0].id)" }
)

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  UPDATED ($($changed.Count) files)" -ForegroundColor Green
Write-Host "  SKIPPED ($($skipped.Count) files)" -ForegroundColor DarkGray
Write-Host "`n  Run: cd client && npx tsc --noEmit" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
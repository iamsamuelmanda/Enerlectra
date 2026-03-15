# ============================================================
#  Enerlectra – Update Cluster Field References
#  Renames cluster.id → cluster.clusterId
#          cluster.capacity_kw → cluster.target_kW
#  Fixes ClusterInput import source
#  Run from project root:  .\update-cluster-refs.ps1
# ============================================================

param(
    [string]$ClientRoot = ".\client"
)

$src      = Join-Path $ClientRoot "src"
$changed  = @()
$skipped  = @()
$notfound = @()

# ── helpers ──────────────────────────────────────────────────

function Apply-Replacements($filePath, $replacements) {
    if (-not (Test-Path $filePath)) {
        $script:notfound += $filePath
        return
    }

    $original = Get-Content $filePath -Raw -Encoding UTF8
    $current  = $original

    foreach ($r in $replacements) {
        $current = $current -replace [regex]::Escape($r.From), $r.To
    }

    if ($current -ne $original) {
        Set-Content -Path $filePath -Value $current -Encoding UTF8 -NoNewline
        $script:changed += $filePath

        # Show a diff summary
        Write-Host ""
        Write-Host "  ✓ $($filePath.Replace($src, 'src'))" -ForegroundColor Green
        foreach ($r in $replacements) {
            if ($original -match [regex]::Escape($r.From)) {
                Write-Host "      '$($r.From)' → '$($r.To)'" -ForegroundColor DarkGreen
            }
        }
    } else {
        $script:skipped += $filePath
    }
}

# ── shared replacement sets ──────────────────────────────────

# Every file that might reference cluster fields
$fieldReplacements = @(
    @{ From = 'cluster.capacity_kw'; To = 'cluster.target_kW'   }
    @{ From = 'cluster.id';          To = 'cluster.clusterId'    }
    # also handle destructured/mapped forms
    @{ From = "{ id }";              To = "{ clusterId }"        }
    @{ From = "c.id";                To = "c.clusterId"          }
    @{ From = "c.capacity_kw";       To = "c.target_kW"          }
    @{ From = "key={c.id}";          To = "key={c.clusterId}"    }
    @{ From = "key={cluster.id}";    To = "key={cluster.clusterId}" }
    @{ From = "value={c.id}";        To = "value={c.clusterId}"  }
    @{ From = "value={cluster.id}";  To = "value={cluster.clusterId}" }
)

# Import source replacement — types/cluster → types/api
$importReplacements = @(
    @{ From = "from '../../../types/cluster'"; To = "from '../../../types/api'" }
    @{ From = "from '../../types/cluster'";   To = "from '../../types/api'"   }
    @{ From = "from '../types/cluster'";      To = "from '../types/api'"      }
    @{ From = "from './types/cluster'";       To = "from './types/api'"       }
    # Also handle ClusterInput being imported from types/cluster anywhere
    @{ From = "import { Cluster, ClusterInput } from '../../../types/cluster'"; To = "import type { Cluster, ClusterInput } from '../../../types/api'" }
    @{ From = "import { ClusterInput } from '../../../types/cluster'";          To = "import type { ClusterInput } from '../../../types/api'"          }
    @{ From = "import { Cluster } from '../../../types/cluster'";               To = "import type { Cluster } from '../../../types/api'"               }
)

# Combined for files that need both
$allReplacements = $fieldReplacements + $importReplacements

# ── target files ─────────────────────────────────────────────

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  Enerlectra – Cluster Reference Updater" -ForegroundColor Cyan
Write-Host "  Target: $src" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Primary targets (fields + imports)
$primaryTargets = @(
    "$src\features\clusters\components\ClusterCard.tsx"
    "$src\features\clusters\components\ClusterDetail.tsx"
    "$src\features\clusters\components\ClusterList.tsx"
    "$src\features\clusters\hooks\useClusters.ts"
    "$src\features\clusters\services\clusterService.ts"
    "$src\features\admin\pages\PilotDashboard.tsx"
    "$src\pages\ClusterView.tsx"
    "$src\store\clusterStore.ts"
)

# Import-only targets (may reference types/cluster but not necessarily field names)
$importOnlyTargets = @(
    "$src\pages\Dashboard.tsx"
    "$src\pages\Admin.tsx"
    "$src\hooks\useAuth.ts"
)

Write-Host ""
Write-Host "  Processing primary targets (fields + imports)..." -ForegroundColor White

foreach ($file in $primaryTargets) {
    Apply-Replacements $file $allReplacements
}

Write-Host ""
Write-Host "  Processing import-only targets..." -ForegroundColor White

foreach ($file in $importOnlyTargets) {
    Apply-Replacements $file $importReplacements
}

# ── broad sweep: catch any remaining types/cluster imports ───
Write-Host ""
Write-Host "  Running broad sweep for remaining types/cluster imports..." -ForegroundColor White

$allTsFiles = Get-ChildItem -Path $src -Recurse -Include "*.ts","*.tsx" |
    Where-Object { $primaryTargets -notcontains $_.FullName -and $importOnlyTargets -notcontains $_.FullName }

foreach ($file in $allTsFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    if ($content -match "types/cluster") {
        Apply-Replacements $file.FullName $importReplacements
    }
}

# ── report ───────────────────────────────────────────────────

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  REPORT" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host ""
Write-Host "  UPDATED ($($changed.Count) files)" -ForegroundColor Green
foreach ($f in $changed) {
    Write-Host "    ✓  $($f.Replace($src, 'src'))" -ForegroundColor Green
}

Write-Host ""
Write-Host "  NO CHANGES NEEDED ($($skipped.Count) files)" -ForegroundColor DarkGray
foreach ($f in $skipped) {
    Write-Host "    –  $($f.Replace($src, 'src'))" -ForegroundColor DarkGray
}

if ($notfound.Count -gt 0) {
    Write-Host ""
    Write-Host "  NOT FOUND ($($notfound.Count) files)" -ForegroundColor Yellow
    foreach ($f in $notfound) {
        Write-Host "    ⚠  $($f.Replace($src, 'src'))" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  MANUAL CHECK — do these after the script" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host ""
Write-Host "  1. src\types\cluster.ts — review if it still needs to exist." -ForegroundColor White
Write-Host "     ClusterInput and Cluster are now in types\api.ts." -ForegroundColor White
Write-Host "     If cluster.ts only had those two, you can delete it." -ForegroundColor White
Write-Host ""
Write-Host "  2. Run: cd client && npx tsc --noEmit" -ForegroundColor White
Write-Host "     Fix any remaining type errors surfaced by the compiler." -ForegroundColor White
Write-Host ""
Write-Host "  3. Search manually for any remaining 'clusterId' used as '.id'" -ForegroundColor White
Write-Host "     in JSX key props or navigation params (e.g. useParams)." -ForegroundColor White
Write-Host ""
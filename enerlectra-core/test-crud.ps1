Write-Host "=== Enerlectra CRUD Test Suite ===" -ForegroundColor Green

# 1. CREATE - Add new clusters
Write-Host "`n1. CREATE new clusters..." -ForegroundColor Yellow
$clusterA = @{ name="Lusaka Cluster A"; location=@{district="LUSAKA"; province="Lusaka"}; target_kW=100 } | ConvertTo-Json
$clusterB = @{ name="Ndola Cluster B"; location=@{district="NDOLA"; province="Copperbelt"}; target_kW=200 } | ConvertTo-Json

$idA = (Invoke-RestMethod -Uri "http://localhost:4000/clusters" -Method Post -Body $clusterA -ContentType "application/json").clusterId
$idB = (Invoke-RestMethod -Uri "http://localhost:4000/clusters" -Method Post -Body $clusterB -ContentType "application/json").clusterId
Write-Host "Created: $idA, $idB" -ForegroundColor Green

# 2. READ - List all
Write-Host "`n2. READ all clusters..." -ForegroundColor Yellow
$clusters = Invoke-RestMethod -Uri "http://localhost:4000/clusters"
Write-Host "Total: $($clusters.Count) clusters" -ForegroundColor Green

# 3. READ - Single (first cluster)
Write-Host "`n3. READ single cluster..." -ForegroundColor Yellow
$single = Invoke-RestMethod -Uri "http://localhost:4000/clusters/$idA"
Write-Host "$($single.name): $($single.target_kW) kW" -ForegroundColor Green

# 4. UPDATE - Modify cluster B
Write-Host "`n4. UPDATE cluster B..." -ForegroundColor Yellow
$update = @{ status="active"; target_kW=250; name="Ndola Cluster B Updated" } | ConvertTo-Json
$updated = Invoke-RestMethod -Uri "http://localhost:4000/clusters/$idB" -Method Put -Body $update -ContentType "application/json"
Write-Host "Updated: $($updated.name) -> $($updated.target_kW) kW" -ForegroundColor Green

# 5. DELETE - Remove cluster A
Write-Host "`n5. DELETE cluster A..." -ForegroundColor Yellow
$deleted = Invoke-RestMethod -Uri "http://localhost:4000/clusters/$idA" -Method Delete
Write-Host "Deleted: $deleted" -ForegroundColor Green

# 6. Final READ - Verify state
Write-Host "`n6. Final state..." -ForegroundColor Yellow
$final = Invoke-RestMethod -Uri "http://localhost:4000/clusters"
$totalKW = ($final | ForEach-Object { [int]$_.target_kW } | Measure-Object -Sum).Sum
Write-Host "Remaining: $($final.Count) clusters, Total: $totalKW kW" -ForegroundColor Green

Write-Host "`n=== CRUD Test Complete! ===" -ForegroundColor Green

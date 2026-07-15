# build_and_stage.ps1
# 完整构建流程：build Wails exe + 同步 standards/assessment/history 到 build/bin/data/
# v0.2 多标准：每个标准独立的 standards.<id>.json / assessment.<id>.json / history/<id>/
# 用法：powershell -File build_and_stage.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "==> [1/4] Building Wails app..." -ForegroundColor Cyan
$env:GOSUMDB = "sum.golang.org"
wails build -clean

Write-Host "==> [2/4] Syncing per-standard data files to build/bin/data/..." -ForegroundColor Cyan
$dstDir = "build\bin\data"
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }

# standards.<id>.json × N
Copy-Item -Path "data\standards.*.json" -Destination $dstDir -Force

# assessment.<id>.json × N（可能还没建，不报错）
Get-ChildItem -Path "data\assessment.*.json" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $dstDir -Force
}

Write-Host "==> [3/4] Syncing per-standard history snapshots..." -ForegroundColor Cyan
# history/<id>/*.json × N
Get-ChildItem -Path "data\history" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $subId = $_.Name
    $dstSub = "$dstDir\history\$subId"
    if (-not (Test-Path $dstSub)) { New-Item -ItemType Directory -Path $dstSub -Force | Out-Null }
    Get-ChildItem -Path $_.FullName -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $dstSub -Force
    }
}

Write-Host "==> [4/4] Done." -ForegroundColor Green
Write-Host ""
Write-Host "Build artifact: build\bin\dsmm-tool-app.exe" -ForegroundColor Yellow
Write-Host "Data files:     build\bin\data\" -ForegroundColor Yellow
Write-Host ""
Write-Host "To run:    cd build\bin && .\dsmm-tool-app.exe" -ForegroundColor Yellow

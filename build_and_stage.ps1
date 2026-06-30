# build_and_stage.ps1
# 完整构建流程：build Wails exe + 同步 standards.json 到 build/bin/data/
# 用法：powershell -File build_and_stage.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "==> [1/3] Building Wails app..." -ForegroundColor Cyan
$env:GOSUMDB = "sum.golang.org"
wails build -clean

Write-Host "==> [2/3] Syncing standards.json to build/bin/data/..." -ForegroundColor Cyan
$dstDir = "build\bin\data"
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }
Copy-Item -Path "data\standards.json" -Destination "$dstDir\standards.json" -Force

Write-Host "==> [3/3] Done." -ForegroundColor Green
Write-Host ""
Write-Host "Build artifact: build\bin\dsmm-tool-app.exe" -ForegroundColor Yellow
Write-Host "Data files:     build\bin\data\" -ForegroundColor Yellow
Write-Host ""
Write-Host "To run:    cd build\bin && .\dsmm-tool-app.exe" -ForegroundColor Yellow
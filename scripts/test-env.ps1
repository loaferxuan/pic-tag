#!/usr/bin/env pwsh

Write-Host "Testing environment..." -ForegroundColor Green

$nodeVersion = node --version 2>&1
Write-Host "Node version: $nodeVersion" -ForegroundColor Cyan

$npmVersion = npm --version 2>&1
Write-Host "npm version: $npmVersion" -ForegroundColor Cyan

$easVersion = node ./node_modules/eas-cli/bin/run --version 2>&1
Write-Host "EAS CLI version: $easVersion" -ForegroundColor Cyan

$projectId = (Get-Content "app.json" | Select-String -Pattern "projectId").ToString().Split(':')[1].Trim().Trim(',').Replace('"', '')
Write-Host "Project ID: $projectId" -ForegroundColor Cyan

Write-Host "`nStarting build..." -ForegroundColor Yellow

& node ./node_modules/eas-cli/bin/run build --platform android --profile release-apk-arm64 --non-interactive 2>&1 | Tee-Object -Variable buildOutput

Write-Host "`nBuild output:" -ForegroundColor Green
Write-Host $buildOutput

exit 0

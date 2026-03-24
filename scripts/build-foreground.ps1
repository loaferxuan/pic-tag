#!/usr/bin/env pwsh

$ErrorActionPreference = "Continue"

$projectRoot = "D:\diou\pic-tag"
Set-Location $projectRoot

Write-Host "========================================" -ForegroundColor Green
Write-Host "EAS Cloud Build - Android APK" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Build command: eas build --platform android --profile release-apk-arm64 --non-interactive" -ForegroundColor Cyan
Write-Host "Build started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

node ./node_modules/eas-cli/bin/run build --platform android --profile release-apk-arm64 --non-interactive

$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "========================================" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "Build finished with exit code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "Build completed at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan

exit $exitCode

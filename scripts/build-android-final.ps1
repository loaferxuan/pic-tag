#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

$projectRoot = "D:\diou\pic-tag"
Set-Location $projectRoot

Write-Host "========================================" -ForegroundColor Green
Write-Host "EAS Cloud Build - Android APK" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

$easPath = Join-Path $projectRoot "node_modules\.bin\eas"

if (-not (Test-Path $easPath)) {
    Write-Host "Error: eas command not found" -ForegroundColor Red
    exit 1
}

Write-Host "Project path: $projectRoot" -ForegroundColor Cyan
Write-Host "EAS path: $easPath" -ForegroundColor Cyan
Write-Host ""

Write-Host "Starting EAS build..." -ForegroundColor Yellow
Write-Host "Command: eas build --platform android --profile release-apk-arm64 --non-interactive" -ForegroundColor Cyan
Write-Host ""

& $easPath build --platform android --profile release-apk-arm64 --non-interactive

$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Build failed with exit code: $exitCode" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

exit $exitCode

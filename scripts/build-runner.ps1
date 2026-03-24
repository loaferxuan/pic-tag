#!/usr/bin/env pwsh

$ErrorActionPreference = "Continue"

$projectRoot = "D:\diou\pic-tag"
Set-Location $projectRoot

Write-Host "========================================" -ForegroundColor Green
Write-Host "EAS Cloud Build - Android APK" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Starting EAS build with node..." -ForegroundColor Yellow
Write-Host ""

$process = Start-Process -FilePath "node" -ArgumentList "./node_modules/eas-cli/bin/run", "build", "--platform", "android", "--profile", "release-apk-arm64", "--non-interactive" -NoNewWindow -PassThru -Wait -RedirectStandardOutput "build-output.log" -RedirectStandardError "build-error.log"

$exitCode = $process.ExitCode

if (Test-Path "build-output.log") {
    Write-Host "Build Output:" -ForegroundColor Cyan
    Get-Content "build-output.log" | Select-Object -Last 50
}

if (Test-Path "build-error.log") {
    $errorContent = Get-Content "build-error.log" -Raw
    if ($errorContent) {
        Write-Host "Build Errors:" -ForegroundColor Red
        Get-Content "build-error.log" | Select-Object -Last 30
    }
}

Write-Host ""
Write-Host "Exit code: $exitCode" -ForegroundColor Yellow

if ($exitCode -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Build failed with exit code: $exitCode" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

Remove-Item "build-output.log" -ErrorAction SilentlyContinue
Remove-Item "build-error.log" -ErrorAction SilentlyContinue

exit $exitCode

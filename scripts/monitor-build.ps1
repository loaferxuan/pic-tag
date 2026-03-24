#!/usr/bin/env pwsh

$ErrorActionPreference = "Continue"

$projectRoot = "D:\diou\pic-tag"
Set-Location $projectRoot

Write-Host "========================================" -ForegroundColor Green
Write-Host "EAS Cloud Build - Monitoring Progress" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Build command: eas build --platform android --profile release-apk-arm64 --non-interactive" -ForegroundColor Cyan
Write-Host "Build started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

$buildLog = "eas-build-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

Write-Host "Logging output to: $buildLog" -ForegroundColor Yellow
Write-Host ""

$process = Start-Process -FilePath "node" -ArgumentList "./node_modules/eas-cli/bin/run", "build", "--platform", "android", "--profile", "release-apk-arm64", "--non-interactive" -NoNewWindow -PassThru

$lastUpdate = Get-Date

while (-not $process.HasExited) {
    Start-Sleep -Seconds 5

    if ((Get-Date) - $lastUpdate -gt (New-TimeSpan -Seconds 30)) {
        Write-Host "." -NoNewline -ForegroundColor Yellow
        $lastUpdate = Get-Date
    }
}

$exitCode = $process.ExitCode

Write-Host ""
Write-Host ""
Write-Host "========================================" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "Build finished with exit code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host ""

Write-Host "Build completed at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Total time: $(($lastUpdate - (Get-Date).AddSeconds(-300)).ToString('hh\:mm\:ss'))" -ForegroundColor Cyan

exit $exitCode

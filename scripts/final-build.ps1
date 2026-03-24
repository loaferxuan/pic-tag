#!/usr/bin/env pwsh

$projectRoot = "D:\diou\pic-tag"
Set-Location $projectRoot

$outputFile = Join-Path $projectRoot "eas-build-output-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"

Write-Host "========================================" -ForegroundColor Green
Write-Host "EAS Cloud Build - Android APK" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Build started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Output file: $outputFile" -ForegroundColor Cyan
Write-Host ""

$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = "node"
$processInfo.Arguments = "./node_modules/eas-cli/bin/run build --platform android --profile release-apk-arm64 --non-interactive"
$processInfo.WorkingDirectory = $projectRoot
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $false

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $processInfo

$process.Start() | Out-Null

$stdout = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()

$process.WaitForExit() | Out-Null

$exitCode = $process.ExitCode

$output = @"
========================================
EAS Cloud Build Output
========================================
Build started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Build finished at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Exit code: $exitCode

========================================
STDOUT:
========================================
$stdout

========================================
STDERR:
========================================
$stderr

========================================
"@

$output | Tee-Object -FilePath $outputFile -Append

Write-Host ""
Write-Host "========================================" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "Build completed with exit code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host "========================================" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
Write-Host ""
Write-Host "Full output saved to: $outputFile" -ForegroundColor Cyan

exit $exitCode

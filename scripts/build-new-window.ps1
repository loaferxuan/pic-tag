#!/usr/bin/env pwsh

$projectRoot = "D:\diou\pic-tag"

Write-Host "Starting EAS build in new window..." -ForegroundColor Green
Write-Host "Project: $projectRoot" -ForegroundColor Cyan

$scriptPath = Join-Path $projectRoot "scripts\build-foreground.ps1"

Start-Process powershell.exe -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-File", "`"$scriptPath`"" -Wait -NoNewWindow

Write-Host "Build process finished" -ForegroundColor Yellow

#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "开始EAS云端构建..." -ForegroundColor Green
Write-Host "项目路径: $projectRoot" -ForegroundColor Cyan

$env:Path = "C:\Program Files\nodejs;$env:Path"

& cmd.exe /c "npx eas-cli build --platform android --profile release-apk-arm64 --non-interactive"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n构建成功完成!" -ForegroundColor Green
} else {
    Write-Host "`n构建失败，退出码: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

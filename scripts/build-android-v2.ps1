#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

$projectRoot = "D:\diou\pic-tag"
Set-Location $projectRoot

Write-Host "========================================" -ForegroundColor Green
Write-Host "EAS Cloud Build - Android APK" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

$nodePath = "C:\Program Files\nodejs\node.exe"
$easCliPath = Join-Path $projectRoot "node_modules\.bin\eas-cli.cmd"

if (-not (Test-Path $nodePath)) {
    $nodePath = "node"
}

if (-not (Test-Path $easCliPath)) {
    Write-Host "错误: eas-cli未找到，请先运行 npm install" -ForegroundColor Red
    exit 1
}

Write-Host "项目路径: $projectRoot" -ForegroundColor Cyan
Write-Host "Node路径: $nodePath" -ForegroundColor Cyan
Write-Host "EAS CLI路径: $easCliPath" -ForegroundColor Cyan
Write-Host ""

Write-Host "开始执行EAS构建..." -ForegroundColor Yellow
Write-Host ""

& $easCliPath build --platform android --profile release-apk-arm64 --non-interactive

$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "构建成功完成!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "构建失败，退出码: $exitCode" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

exit $exitCode

@echo off
cd /d D:\diou\pic-tag
echo ========================================
echo EAS Cloud Build - Android APK
echo ========================================
echo.
echo Starting EAS build...
echo Command: node ./node_modules/eas-cli/bin/run build --platform android --profile release-apk-arm64 --non-interactive
echo.

node ./node_modules/eas-cli/bin/run build --platform android --profile release-apk-arm64 --non-interactive

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Build completed successfully!
    echo ========================================
) else (
    echo.
    echo ========================================
    echo Build failed with exit code: %ERRORLEVEL%
    echo ========================================
    exit /b %ERRORLEVEL%
)

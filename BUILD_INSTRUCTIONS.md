# PicTag APK 构建指南

## 环境要求

### 必需软件

1. **Node.js 18+**
   - 下载地址：https://nodejs.org/

2. **JDK 17**（仅本地构建需要）
   - Windows: https://adoptium.net/temurin/releases/?version=17
   - 或使用 Chocolatey: `choco install openjdk17`

3. **Android SDK**（仅本地构建需要）
   - Windows: https://developer.android.com/studio#command-line-tools-only
   - 或使用 Chocolatey: `choco install android-sdk`

## 快速构建步骤

### 方法一：使用构建脚本（推荐）

**Windows PowerShell:**
```powershell
cd d:\diou\pic-tag\scripts
.\build-android.ps1
```

**提供以下选项:**
1. EAS Build (ARM64) - 使用 EAS 云端构建 ARM64 APK
2. EAS Build (ARMv7) - 使用 EAS 云端构建 ARMv7 APK
3. EAS Build (Store) - 使用 EAS 云端构建应用商店版本
4. 本地预构建 - 在本地生成 Android 项目并构建

**命令行参数:**
```powershell
.\build-android.ps1 -Type eas        # EAS Build ARM64
.\build-android.ps1 -Type eas-armv7  # EAS Build ARMv7
.\build-android.ps1 -Type eas-store   # EAS Build Store
.\build-android.ps1 -Type local      # 本地构建
```

### 方法二：手动 EAS Build

```bash
# 1. 登录 EAS
cd d:\diou\pic-tag
./node_modules/.bin/eas login

# 2. 构建 APK (使用完整路径)
cd d:\diou\pic-tag
./node_modules/.bin/eas build --platform android --profile release-apk-arm64

# 3. 下载 APK
# 构建完成后访问 https://expo.dev/builds 或使用终端提供的下载链接
```

### 方法三：本地构建

```bash
# 1. 设置环境变量 (Windows PowerShell)
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.x"
$env:ANDROID_HOME = "C:\Users\<用户名>\AppData\Local\Android\Sdk"
$env:PATH = "$env:PATH;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools"

# 2. 进入项目目录
cd d:\diou\pic-tag

# 3. 清理并重新生成原生项目
npx expo prebuild --platform android --clean

# 4. 构建 APK
cd android
.\gradlew assembleRelease

# 5. APK 输出位置
# android\app\build\outputs\apk\release\app-release.apk
```

## 构建配置

### 版本信息

当前配置（已更新）：

| 项目 | 版本 |
|------|------|
| 应用版本 | 1.1.0 |
| Android 版本码 | 2 |
| 运行时版本 | 1.1.0 |

### 构建 Profile

- `release-apk-arm64`：64 位设备直装 APK（推荐）
- `release-apk-armv7`：32 位旧设备兼容 APK
- `store`：Google Play AAB 包

## 安装测试

APK 构建完成后：

1. **传输 APK**
   ```bash
   adb install app-release.apk
   # 或手动将 APK 复制到设备并安装
   ```

2. **验证清单**
   ```bash
   jarsigner -verify app-release.apk
   aapt dump badging app-release.apk
   ```

3. **功能测试**
   - [ ] 应用启动正常
   - [ ] 照片导入功能正常
   - [ ] 标签管理功能正常
   - [ ] 人物识别功能正常
   - [ ] 搜索筛选功能正常

## 常见问题

### Q1: JAVA_HOME 未设置
```
# Windows PowerShell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
```

### Q2: Android SDK 未找到
```
# Windows PowerShell
$env:ANDROID_HOME = "C:\Users\<用户名>\AppData\Local\Android\Sdk"
```

### Q3: EAS Build 失败
```bash
# 清除缓存后重试
npx expo start --clear
npx eas build --platform android --profile release-apk-arm64 --clear-cache
```

## 项目已准备就绪

以下文件已生成：
- ✅ `android/` 目录（原生 Android 项目）
- ✅ `dist/` 目录（JS Bundle）
- ✅ `eas.json` 配置
- ✅ `app.json` 版本更新

配置好环境后即可构建 APK。

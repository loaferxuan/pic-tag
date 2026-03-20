# Android 发布包说明

PicTag 现在区分开发包、可直装发布 APK 和商店 AAB，避免继续分发一个同时包含多套 ABI 的通用 APK。

## 构建 profile

```bash
# 开发调试包，保留 Expo Dev Client
npx eas build --platform android --profile development

# 默认直装发布包，面向绝大多数 64 位 Android 手机
npx eas build --platform android --profile release-apk-arm64

# 兼容旧 32 位设备的直装发布包
npx eas build --platform android --profile release-apk-armv7

# 商店分发包，上传到 Google Play
npx eas build --platform android --profile store
```

## 分发规则

- `release-apk-arm64` 是默认给用户和测试同学安装的 APK。
- `release-apk-armv7` 只给明确仍在使用 32 位设备的用户。
- `store` 产物是 AAB，不用于手动分发。
- `development` 只用于开发调试，保留 Dev Client。

## 当前瘦身策略

- 通过 `ANDROID_BUILD_ARCHS` 控制 Android 仅构建目标 ABI。
- 发布 APK 默认开启 release minify 和 shrink resources。
- 保持 `useLegacyPackaging: false` 和 `enableBundleCompression: false`，优先维持启动体验。
- 业务功能和现有原生模块不删减，当前阶段只做构建拆分和资源压缩。

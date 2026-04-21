# AGENTS.md

本文件定义本仓库的最小协作规范，适用于人类开发者与 AI Agent。

## 1. 沟通与文档
- 默认使用中文沟通与说明。
- 涉及行为变更时，补充必要文档或说明。

## 2. Git 提交规范
- 提交信息必须遵循 Conventional Commits。
- 标题格式：`<type>(<scope>): <subject>`（`scope` 可选）。
- 常用 `type`：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`。
- 提交正文（body）必须使用中文，说明变更原因、主要改动和影响范围。

## 3. 版本号与更新工作流
- `expo.version` 用于展示与蒲公英 `buildVersion` 对比，发版时按语义化版本递增。
- 应用内检查更新统一走蒲公英 `POST /apiv2/app/check`，是否强制更新只看响应字段 `needForceUpdate`。
- 配置项 `expo.extra.pgyer.appKey` 允许提交到仓库；`_api_key` 禁止写入仓库。
- `_api_key` 通过 EAS Secret 注入：`eas secret:create --scope project --name EXPO_PUBLIC_PGYER_API_KEY --value <你的_api_key>`。
- 本地调试可临时在 `expo.extra.pgyer.apiKey` 填值，联调后必须删除并改回 EAS Secret。

### 3.1 ABI 与蒲公英分发注意事项
- 蒲公英 App Check API 对同一个 `appKey` 只返回「最后一次上传」的 build 的 `downloadURL`，即新版覆盖式替换。
- 因此 `eas.json` 中的 `release-apk-arm64` 与 `release-apk-armv7` 不要同时上传到同一个蒲公英 App，否则会出现 arm64 设备拉到 armv7 APK（或反之）的情况。
- 推荐做法：只把 `release-apk-arm64` 作为默认分发上传到蒲公英（arm64 设备占 95%+），`release-apk-armv7` 仅用于线下点对点支持。
- 若确需同时兼容 32 位，请改走单个「多 ABI 通用 APK」（在构建配置中将 `ANDROID_BUILD_ARCHS` 设为 `arm64-v8a,armeabi-v7a`）再上传，保持「一个蒲公英 App = 一个 build」。

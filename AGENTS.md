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

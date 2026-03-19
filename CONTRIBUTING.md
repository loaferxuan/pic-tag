# 贡献指南

## 1. 分支策略

- `main`：稳定分支。
- 功能开发：`feat/<topic>`
- 缺陷修复：`fix/<topic>`
- 重构/文档/测试：`refactor/<topic>`、`docs/<topic>`、`test/<topic>`

## 2. 提交规范

必须使用 Conventional Commits：

```text
<type>(<scope>): <subject>
```

常用 `type`：

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`

提交正文请使用中文，说明：

- 变更原因
- 主要改动
- 影响范围

## 3. PR 规范

- 描述问题背景与目标。
- 列出主要改动点。
- 附带验证方式（命令与结果）。
- 涉及行为变更时同步更新文档。

## 4. 本地检查

```bash
npm run lint
npm test -- --runInBand
```

检查通过后再发起 PR。

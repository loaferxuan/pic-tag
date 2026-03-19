# 备份格式（v1）

## 1. 基本信息

- `format`: `pictag-data`
- `formatVersion`: `1.x.x`
- `checksumAlgorithm`: `sha256`
- 当前版本仅支持解析 `pictag-data` `1.x.x` 备份文件

## 2. Envelope 结构

```json
{
  "format": "pictag-data",
  "formatVersion": "1.0.0",
  "createdAt": "2026-03-19T00:00:00.000Z",
  "appSchemaVersion": 1,
  "checksumAlgorithm": "sha256",
  "payloadSha256": "<sha256>",
  "payload": {}
}
```

## 3. Payload 结构

- `exportId`: 导出任务 ID
- `categories`: 分类列表，包含 `externalId`
- `tags`: 标签列表，包含 `externalId` 与 `categoryExternalId`
- `settings.defaultTagExternalIds`: 默认标签外部编号列表
- `photoTagLinks`: 照片与标签关联记录
- `stats`: 导出统计摘要

## 4. 导出流程

1. 读取分类、标签、默认标签和照片关联数据。
2. 组装 payload。
3. 计算 `payloadSha256`。
4. 写入本地 JSON 文件并返回导出摘要。

导出文件名格式为 `pictag-data-YYYYMMDD-HHmmss.json`。

## 5. 导入流程

1. 读取并解析 JSON。
2. 校验 envelope 与 payload 结构。
3. 校验 `payloadSha256` 一致性。
4. 覆盖重建本地数据。
5. 对未完成关联记录执行自动回填。

## 6. 自动回填机制

- 入口：导入后自动执行，可通过 `autoBackfill` 控制。
- 参数：`maxScanAssets`、`onProgress`
- 结果：返回匹配数、创建数、剩余未完成数和扫描数等摘要。

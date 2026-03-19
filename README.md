# PicTag

PicTag 是一个面向 Android 优先交付的照片标签管理应用，基于 Expo、TypeScript 和 SQLite 构建。

## 核心能力

- 照片导入：从系统媒体库导入照片引用，保存标签、备注和指纹等元数据。
- 标签体系：支持分类与标签两级结构，并提供默认标签配置。
- 搜索筛选：支持标签、未打标签、日期、缺失分类和未完成关联等筛选条件。
- 统计分析：提供照片总量、标签覆盖率和时间分布等统计视图。
- 数据备份：支持导出与导入 JSON 备份，导入后自动执行回填并反馈进度。

## 目录结构

```text
app/                             # 路由与页面
src/features/
  photo/                         # 照片导入、详情、关联
  tag/                           # 分类与标签管理
  search/                        # 搜索与筛选
  stats/                         # 统计聚合与展示
  backup/                        # 备份导入导出与回填
src/infra/db/                    # SQLite 客户端、schema 初始化、repository
src/shared/                      # 通用类型、工具、UI 组件
```

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 本地开发

```bash
npm run start
npm run android
```

### 3) 检查与测试

```bash
npm run lint
npm test -- --runInBand
```

## 发布

```bash
# Android 内部分发 APK
npx eas build --platform android --profile production

# Android 商店包 AAB
npx eas build --platform android --profile store
```

## 备份格式

- 当前格式：`pictag-data`
- 当前版本：`1.x.x`
- 当前版本仅支持导入 `pictag-data` `1.x.x` 备份文件

详情见：[BACKUP_FORMAT.md](./BACKUP_FORMAT.md)

## 文档索引

- 架构说明：[ARCHITECTURE.md](./ARCHITECTURE.md)
- 备份格式：[BACKUP_FORMAT.md](./BACKUP_FORMAT.md)
- 测试说明：[TESTING.md](./TESTING.md)
- 贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)

## 许可证

MIT，见 [LICENSE](./LICENSE)。

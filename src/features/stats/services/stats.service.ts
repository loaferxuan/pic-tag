import { getRepositories } from '@/infra/db';
import type {
  CategoryStat,
  CategoryTagStat,
  StatsSummary,
  TakenDateStatsPage,
  TimeStatsBucket,
  TimeStatsGranularity,
} from '@/shared/types/domain';

const UNCATEGORIZED_NAME = '未分类';
const UNCATEGORIZED_COLOR = '#9CA3AF';
const DEFAULT_TIME_STATS_GRANULARITY: TimeStatsGranularity = 'month';
const DEFAULT_TIME_STATS_PAGE_SIZE = 100;

function toCategoryKey(categoryId: number | null): string {
  return categoryId == null ? 'uncategorized' : String(categoryId);
}

function sortCategories(a: CategoryStat, b: CategoryStat): number {
  if (a.coveragePhotoCount !== b.coveragePhotoCount) {
    return b.coveragePhotoCount - a.coveragePhotoCount;
  }
  return a.categoryName.localeCompare(b.categoryName);
}

function sortCategoryTags(a: CategoryTagStat, b: CategoryTagStat): number {
  if (a.photoCount !== b.photoCount) {
    return b.photoCount - a.photoCount;
  }
  return a.tagName.localeCompare(b.tagName);
}

function normalizeGranularity(value?: TimeStatsGranularity): TimeStatsGranularity {
  if (value === 'year' || value === 'month' || value === 'day') {
    return value;
  }
  return DEFAULT_TIME_STATS_GRANULARITY;
}

function normalizeLimit(value?: number): number {
  if (!Number.isFinite(value) || value == null || value <= 0) return DEFAULT_TIME_STATS_PAGE_SIZE;
  return Math.floor(value);
}

function normalizeOffset(value?: number): number {
  if (!Number.isFinite(value) || value == null || value < 0) return 0;
  return Math.floor(value);
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function toBucketLabel(bucketKey: string, granularity: TimeStatsGranularity): string {
  if (granularity === 'year') {
    return /^\d{4}$/.test(bucketKey) ? bucketKey : bucketKey;
  }
  if (granularity === 'month') {
    return /^\d{4}-\d{2}$/.test(bucketKey) ? bucketKey : bucketKey;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(bucketKey) ? bucketKey : bucketKey;
}

export async function getUntaggedCount(): Promise<number> {
  const repos = await getRepositories();
  return repos.stats.getUntaggedCount();
}

export async function getTotalPhotoCount(): Promise<number> {
  const repos = await getRepositories();
  return repos.stats.getTotalPhotoCount();
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const repos = await getRepositories();
  const [totalPhotos, untaggedCount, unresolvedAssociationCount, tagRows, coverageRows, categoryRows] =
    await Promise.all([
    repos.stats.getTotalPhotoCount(),
    repos.stats.getUntaggedCount(),
    repos.stats.getUnresolvedAssociationPhotoCount(),
    repos.stats.getTagUsageByCategoryRaw(),
    repos.stats.getCategoryCoverageRaw(),
    repos.tagCategory.findAll({ limit: 500 }),
  ]);

  const coverageByCategory = new Map<string, number>();
  for (const row of coverageRows) {
    coverageByCategory.set(toCategoryKey(row.category_id), row.coverage_photo_count ?? 0);
  }

  const categoryByKey = new Map<string, CategoryStat>();
  for (const row of categoryRows) {
    const key = toCategoryKey(row.id);
    categoryByKey.set(key, {
      categoryId: row.id,
      categoryName: row.name,
      categoryColor: row.color,
      tagCount: 0,
      coveragePhotoCount: coverageByCategory.get(key) ?? 0,
      coverageRate: 0,
      assignmentCount: 0,
    });
  }

  const pendingTags: Array<{
    categoryKey: string;
    categoryId: number | null;
    categoryName: string;
    categoryColor: string;
    tagId: number;
    tagName: string;
    tagColor: string;
    photoCount: number;
  }> = [];

  for (const row of tagRows) {
    const categoryId = row.category_id ?? null;
    const categoryKey = toCategoryKey(categoryId);

    let category = categoryByKey.get(categoryKey);
    if (!category) {
      category = {
        categoryId,
        categoryName: categoryId == null ? UNCATEGORIZED_NAME : row.category_name ?? `分类${categoryId}`,
        categoryColor: categoryId == null ? UNCATEGORIZED_COLOR : row.category_color ?? UNCATEGORIZED_COLOR,
        tagCount: 0,
        coveragePhotoCount: coverageByCategory.get(categoryKey) ?? 0,
        coverageRate: 0,
        assignmentCount: 0,
      };
      categoryByKey.set(categoryKey, category);
    }

    category.tagCount += 1;
    category.assignmentCount += row.photo_count;

    pendingTags.push({
      categoryKey,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      categoryColor: category.categoryColor,
      tagId: row.tag_id,
      tagName: row.tag_name,
      tagColor: row.tag_color,
      photoCount: row.photo_count,
    });
  }

  for (const category of categoryByKey.values()) {
    category.coverageRate = totalPhotos > 0 ? category.coveragePhotoCount / totalPhotos : 0;
  }

  const categoryStats = Array.from(categoryByKey.values()).sort(sortCategories);
  const categorySortIndex = new Map<string, number>();
  const categoryAssignmentCount = new Map<string, number>();
  for (let i = 0; i < categoryStats.length; i += 1) {
    const category = categoryStats[i];
    const key = toCategoryKey(category.categoryId);
    categorySortIndex.set(key, i);
    categoryAssignmentCount.set(key, category.assignmentCount);
  }

  const categoryTagStats = pendingTags
    .map((tag) => {
      const assignmentCount = categoryAssignmentCount.get(tag.categoryKey) ?? 0;
      return {
        categoryId: tag.categoryId,
        categoryName: tag.categoryName,
        categoryColor: tag.categoryColor,
        tagId: tag.tagId,
        tagName: tag.tagName,
        tagColor: tag.tagColor,
        photoCount: tag.photoCount,
        categoryShare: assignmentCount > 0 ? tag.photoCount / assignmentCount : 0,
        globalShare: totalPhotos > 0 ? tag.photoCount / totalPhotos : 0,
      } as CategoryTagStat;
    })
    .sort((a, b) => {
      const aCategoryIndex = categorySortIndex.get(toCategoryKey(a.categoryId)) ?? Number.MAX_SAFE_INTEGER;
      const bCategoryIndex = categorySortIndex.get(toCategoryKey(b.categoryId)) ?? Number.MAX_SAFE_INTEGER;
      if (aCategoryIndex !== bCategoryIndex) {
        return aCategoryIndex - bCategoryIndex;
      }
      return sortCategoryTags(a, b);
    });

  return {
    totalPhotos,
    untaggedCount,
    unresolvedAssociationCount,
    categoryStats,
    categoryTagStats,
  };
}

export async function getTakenDateStatsPage(params?: {
  granularity?: TimeStatsGranularity;
  limit?: number;
  offset?: number;
}): Promise<TakenDateStatsPage> {
  const granularity = normalizeGranularity(params?.granularity);
  const limit = normalizeLimit(params?.limit);
  const offset = normalizeOffset(params?.offset);
  const repos = await getRepositories();

  const [bucketRows, totalBucketsRaw, undatedPhotoCountRaw, datedPhotoCountRaw] = await Promise.all([
    repos.stats.getTakenDateBucketsRaw(granularity, limit, offset),
    repos.stats.countTakenDateBuckets(granularity),
    repos.stats.getUndatedPhotoCount(),
    repos.stats.getDatedPhotoCount(),
  ]);

  const buckets: TimeStatsBucket[] = bucketRows.map((row) => ({
    key: row.bucket_key,
    label: toBucketLabel(row.bucket_key, granularity),
    photoCount: normalizeCount(row.photo_count),
  }));

  const totalBuckets = normalizeCount(totalBucketsRaw);
  const loadedBuckets = Math.min(totalBuckets, offset + buckets.length);
  const datedPhotoCount = normalizeCount(datedPhotoCountRaw);
  const undatedPhotoCount = normalizeCount(undatedPhotoCountRaw);

  return {
    granularity,
    buckets,
    totalBuckets,
    loadedBuckets,
    hasMore: loadedBuckets < totalBuckets,
    undatedPhotoCount,
    datedPhotoCount,
  };
}


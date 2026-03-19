import { getRepositories } from '@/infra/db';
import { KV_DEFAULT_TAG_IDS } from '@/shared/constants';

function normalizeTagIds(tagIds: number[]): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];
  for (const tagId of tagIds) {
    if (!Number.isInteger(tagId) || tagId <= 0 || seen.has(tagId)) continue;
    seen.add(tagId);
    normalized.push(tagId);
  }
  return normalized;
}

function parseStoredTagIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const numbers: number[] = [];
    for (const item of parsed) {
      const candidate =
        typeof item === 'number'
          ? item
          : typeof item === 'string'
            ? Number(item)
            : NaN;
      if (Number.isInteger(candidate) && candidate > 0) {
        numbers.push(candidate);
      }
    }
    return normalizeTagIds(numbers);
  } catch {
    return [];
  }
}

async function filterExistingTagIds(tagIds: number[]): Promise<number[]> {
  const repos = await getRepositories();
  return repos.tag.findExistingIds(normalizeTagIds(tagIds));
}

export async function getSanitizedDefaultTagIds(): Promise<number[]> {
  const repos = await getRepositories();
  const stored = await repos.settings.get(KV_DEFAULT_TAG_IDS);
  const parsed = parseStoredTagIds(stored);
  const sanitized = await filterExistingTagIds(parsed);
  const parsedText = JSON.stringify(parsed);
  const sanitizedText = JSON.stringify(sanitized);
  if (stored == null || parsedText !== sanitizedText || stored !== sanitizedText) {
    await repos.settings.set(KV_DEFAULT_TAG_IDS, sanitizedText);
  }
  return sanitized;
}

export async function saveDefaultTagIds(tagIds: number[]): Promise<number[]> {
  const repos = await getRepositories();
  const sanitized = await filterExistingTagIds(tagIds);
  await repos.settings.set(KV_DEFAULT_TAG_IDS, JSON.stringify(sanitized));
  return sanitized;
}

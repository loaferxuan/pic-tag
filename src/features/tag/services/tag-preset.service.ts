import { getRepositories } from '@/infra/db';
import type { TagPresetRepository, TagPresetWithItems, TagPresetItemRow } from '@/infra/db/repositories/tag-preset.repository';
import type { TagRow } from '@/shared/types/database';
import { saveDefaultTagIds, syncDefaultTagIdsFromPreset } from './default-tag.service';

export interface TagPresetDisplayItem {
  id: number;
  type: 'existing' | 'custom';
  tagId?: number;
  tagName?: string;
  tagColor?: string;
  customName?: string;
  customColor?: string;
  sortOrder: number;
}

export interface TagPresetDisplay {
  id: number;
  name: string;
  description: string | null;
  color: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  itemCount: number;
  items: TagPresetDisplayItem[];
}

function mapPresetToDisplay(presetWithItems: TagPresetWithItems): TagPresetDisplay {
  const items: TagPresetDisplayItem[] = presetWithItems.items.map((item) => ({
    id: item.id,
    type: item.tag_id !== null ? 'existing' : 'custom',
    tagId: item.tag_id ?? undefined,
    tagName: item.tag_id ? undefined : item.custom_tag_name ?? undefined,
    tagColor: item.tag_id ? undefined : item.custom_tag_color ?? undefined,
    customName: item.custom_tag_name ?? undefined,
    customColor: item.custom_tag_color ?? undefined,
    sortOrder: item.sort_order,
  }));

  return {
    id: presetWithItems.id,
    name: presetWithItems.name,
    description: presetWithItems.description,
    color: presetWithItems.color,
    isActive: presetWithItems.is_active === 1,
    isDefault: presetWithItems.is_default === 1,
    sortOrder: presetWithItems.sort_order,
    itemCount: presetWithItems.items.length,
    items,
  };
}

export async function getAllPresets(): Promise<TagPresetDisplay[]> {
  const repos = await getRepositories();
  const presetsWithItems = await repos.tagPreset.getAllPresetsWithItems(true);
  return presetsWithItems.map(mapPresetToDisplay);
}

export async function getActivePresets(): Promise<TagPresetDisplay[]> {
  const repos = await getRepositories();
  const presetsWithItems = await repos.tagPreset.getAllPresetsWithItems(false);
  return presetsWithItems.map(mapPresetToDisplay);
}

export async function getPresetById(id: number): Promise<TagPresetDisplay | null> {
  const repos = await getRepositories();
  const presetWithItems = await repos.tagPreset.getPresetWithItems(id);
  if (!presetWithItems) return null;
  return mapPresetToDisplay(presetWithItems);
}

export async function createPreset(data: {
  name: string;
  description?: string;
  color?: string;
}): Promise<TagPresetDisplay> {
  const repos = await getRepositories();
  const preset = await repos.tagPreset.create({
    name: data.name,
    description: data.description,
    color: data.color,
  });

  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    color: preset.color,
    isActive: preset.is_active === 1,
    sortOrder: preset.sort_order,
    itemCount: 0,
    items: [],
  };
}

export async function updatePreset(
  id: number,
  data: Partial<{
    name: string;
    description: string | null;
    color: string;
    isActive: boolean;
  }>
): Promise<TagPresetDisplay | null> {
  const repos = await getRepositories();
  const updated = await repos.tagPreset.update(id, data);
  if (!updated) return null;
  return getPresetById(id);
}

export async function deletePreset(id: number): Promise<boolean> {
  const repos = await getRepositories();
  return repos.tagPreset.delete(id);
}

export async function duplicatePreset(sourceId: number, newName: string): Promise<TagPresetDisplay | null> {
  const repos = await getRepositories();
  const newPreset = await repos.tagPreset.duplicatePreset(sourceId, newName);
  if (!newPreset) return null;
  return getPresetById(newPreset.id);
}

export async function setDefaultPreset(presetId: number): Promise<TagPresetDisplay | null> {
  const repos = await getRepositories();
  const updated = await repos.tagPreset.setAsDefault(presetId);
  if (!updated) return null;
  await syncDefaultTagIdsFromPreset();
  return getPresetById(presetId);
}

export async function removeDefaultPreset(presetId: number): Promise<TagPresetDisplay | null> {
  const repos = await getRepositories();
  const updated = await repos.tagPreset.removeDefault(presetId);
  if (!updated) return null;
  await saveDefaultTagIds([]);
  return getPresetById(presetId);
}

export async function getDefaultPreset(): Promise<TagPresetDisplay | null> {
  const repos = await getRepositories();
  const preset = await repos.tagPreset.getDefaultPreset();
  if (!preset) return null;
  return getPresetById(preset.id);
}

export async function getDefaultTagIds(): Promise<number[]> {
  const repos = await getRepositories();
  return repos.tagPreset.getDefaultPresetTagIds();
}

export async function addExistingTagToPreset(
  presetId: number,
  tagId: number,
  sortOrder?: number
): Promise<TagPresetDisplayItem> {
  const repos = await getRepositories();
  const item = await repos.tagPreset.addItem({
    presetId,
    tagId,
    sortOrder: sortOrder ?? (await repos.tagPreset.getItemCount(presetId)),
  });

  return {
    id: item.id,
    type: 'existing',
    tagId: item.tag_id ?? undefined,
    sortOrder: item.sort_order,
  };
}

export async function addCustomTagToPreset(
  presetId: number,
  tagName: string,
  tagColor?: string,
  sortOrder?: number
): Promise<TagPresetDisplayItem> {
  const repos = await getRepositories();
  const item = await repos.tagPreset.addItem({
    presetId,
    customTagName: tagName,
    customTagColor: tagColor,
    sortOrder: sortOrder ?? (await repos.tagPreset.getItemCount(presetId)),
  });

  return {
    id: item.id,
    type: 'custom',
    customName: item.custom_tag_name ?? undefined,
    customColor: item.custom_tag_color ?? undefined,
    sortOrder: item.sort_order,
  };
}

export async function removeItemFromPreset(itemId: number): Promise<boolean> {
  const repos = await getRepositories();
  return repos.tagPreset.deleteItem(itemId);
}

export async function updateItem(
  itemId: number,
  data: Partial<{
    sortOrder: number;
    customTagName: string | null;
    customTagColor: string | null;
  }>
): Promise<TagPresetDisplayItem | null> {
  const repos = await getRepositories();
  const item = await repos.tagPreset.updateItem(itemId, data);
  if (!item) return null;

  return {
    id: item.id,
    type: item.tag_id !== null ? 'existing' : 'custom',
    tagId: item.tag_id ?? undefined,
    customName: item.custom_tag_name ?? undefined,
    customColor: item.custom_tag_color ?? undefined,
    sortOrder: item.sort_order,
  };
}

export async function reorderPresetItems(presetId: number, itemIds: number[]): Promise<void> {
  const repos = await getRepositories();
  await repos.tagPreset.reorderItems(presetId, itemIds);
}

export async function getPresetTagIds(presetId: number): Promise<number[]> {
  const repos = await getRepositories();
  const items = await repos.tagPreset.getItemsByPresetId(presetId);
  return items.filter((item) => item.tag_id !== null).map((item) => item.tag_id as number);
}

export async function applyPresetToPhotos(presetId: number, photoIds: number[]): Promise<{
  appliedPresetId: number;
  photoCount: number;
  tagIds: number[];
}> {
  const repos = await getRepositories();
  const tagIds = await getPresetTagIds(presetId);

  if (tagIds.length === 0) {
    return { appliedPresetId: presetId, photoCount: 0, tagIds: [] };
  }

  for (const photoId of photoIds) {
    const existingTags = await repos.photo.getTagIds(photoId);
    const mergedTags = [...new Set([...existingTags, ...tagIds])];
    await repos.photo.setTags(photoId, mergedTags);
  }

  return {
    appliedPresetId: presetId,
    photoCount: photoIds.length,
    tagIds,
  };
}

export const PRESET_COLORS = [
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#14B8A6',
  '#06B6D4',
  '#3B82F6',
];

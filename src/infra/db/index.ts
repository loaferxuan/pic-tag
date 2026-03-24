export { getDb, closeDb } from './client';
export { initializeDatabaseSchema } from './schema/initialize-schema';
export { PhotoRepository } from './repositories/photo.repository';
export { TagRepository, TagCategoryRepository } from './repositories/tag.repository';
export { StatsRepository } from './repositories/stats.repository';
export { SettingsRepository } from './repositories/settings.repository';
export { TagPresetRepository } from './repositories/tag-preset.repository';

import { getDb } from './client';
import { PhotoRepository } from './repositories/photo.repository';
import { TagRepository, TagCategoryRepository } from './repositories/tag.repository';
import { StatsRepository } from './repositories/stats.repository';
import { SettingsRepository } from './repositories/settings.repository';
import { TagPresetRepository } from './repositories/tag-preset.repository';

export async function getRepositories() {
  const db = await getDb();
  return {
    photo: new PhotoRepository(db),
    tag: new TagRepository(db),
    tagCategory: new TagCategoryRepository(db),
    stats: new StatsRepository(db),
    settings: new SettingsRepository(db),
    tagPreset: new TagPresetRepository(db),
  };
}

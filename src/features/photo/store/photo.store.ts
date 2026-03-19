import { create } from 'zustand';
import type { Photo } from '@/shared/types/domain';
import type { PhotoQueryOptions } from '@/shared/types/domain';
import type { PhotoImportItem, PhotoImportOptions } from '@/features/photo/services/photo.service';
import * as photoService from '@/features/photo/services/photo.service';

interface PhotoState {
  photos: Photo[];
  loading: boolean;
  error: string | null;
  queryOptions: PhotoQueryOptions | undefined;

  loadPhotos: (options?: PhotoQueryOptions) => Promise<Photo[]>;
  loadMorePhotos: (options?: PhotoQueryOptions) => Promise<Photo[]>;
  importPhoto: (uri: string, options?: PhotoImportOptions) => Promise<Photo | null>;
  importPhotos: (items: PhotoImportItem[]) => Promise<Photo[]>;
  updatePhoto: (id: number, data: Parameters<typeof photoService.updatePhoto>[1]) => Promise<void>;
  deletePhoto: (id: number) => Promise<boolean>;
  setPhotoTags: (photoId: number, tagIds: number[]) => Promise<void>;
  addPhotoTag: (photoId: number, tagId: number) => Promise<void>;
  removePhotoTag: (photoId: number, tagId: number) => Promise<void>;
  applyPendingDefaultTags: (photoId: number) => Promise<boolean>;
  repairPhotoUri: (photoId: number) => Promise<boolean>;
  linkPhotoToResolvedItem: (photoId: number, item: PhotoImportItem) => Promise<Photo | null>;
  setQueryOptions: (opts: PhotoQueryOptions | undefined) => void;
  clearError: () => void;
}

function dedupePhotosById(photos: Photo[]): Photo[] {
  const deduped = new Map<number, Photo>();
  for (const photo of photos) {
    deduped.set(photo.id, photo);
  }
  return Array.from(deduped.values());
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  photos: [],
  loading: false,
  error: null,
  queryOptions: undefined,

  loadPhotos: async (options) => {
    set({ loading: true, error: null });
    try {
      const opts = options ?? get().queryOptions;
      if (opts) set({ queryOptions: opts });
      const photos = await photoService.getPhotos(opts);
      set({ photos });
      return photos;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载失败' });
      return [];
    } finally {
      set({ loading: false });
    }
  },

  loadMorePhotos: async (options) => {
    set({ error: null });
    try {
      const opts = options ?? get().queryOptions;
      const incoming = await photoService.getPhotos(opts);
      set((s) => ({ photos: dedupePhotosById([...s.photos, ...incoming]) }));
      return incoming;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '加载失败' });
      return [];
    }
  },

  importPhoto: async (uri, options) => {
    set({ loading: true, error: null });
    try {
      const photo = await photoService.importPhoto(uri, options);
      if (photo) {
        set((s) => ({ photos: [photo, ...s.photos] }));
      }
      return photo;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '导入失败' });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  importPhotos: async (items) => {
    set({ loading: true, error: null });
    try {
      const photos = await photoService.importPhotos(items);
      set((s) => ({ photos: [...photos, ...s.photos] }));
      return photos;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '导入失败' });
      return [];
    } finally {
      set({ loading: false });
    }
  },

  updatePhoto: async (id, data) => {
    set({ error: null });
    try {
      const updated = await photoService.updatePhoto(id, data);
      if (updated) {
        set((s) => ({
          photos: s.photos.map((p) => (p.id === id ? updated : p)),
        }));
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '更新失败' });
    }
  },

  deletePhoto: async (id) => {
    set({ error: null });
    try {
      await photoService.deletePhoto(id);
      set((s) => ({
        photos: s.photos.filter((p) => p.id !== id),
      }));
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '删除失败' });
      return false;
    }
  },

  setPhotoTags: async (photoId, tagIds) => {
    set({ error: null });
    try {
      await photoService.setPhotoTags(photoId, tagIds);
      const photo = await photoService.getPhoto(photoId);
      if (photo) {
        set((s) => ({
          photos: s.photos.map((p) => (p.id === photoId ? photo : p)),
        }));
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '更新标签失败' });
    }
  },

  addPhotoTag: async (photoId, tagId) => {
    set({ error: null });
    try {
      await photoService.addPhotoTag(photoId, tagId);
      const photo = await photoService.getPhoto(photoId);
      if (photo) {
        set((s) => ({
          photos: s.photos.map((p) => (p.id === photoId ? photo : p)),
        }));
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '添加标签失败' });
    }
  },

  removePhotoTag: async (photoId, tagId) => {
    set({ error: null });
    try {
      await photoService.removePhotoTag(photoId, tagId);
      const photo = await photoService.getPhoto(photoId);
      if (photo) {
        set((s) => ({
          photos: s.photos.map((p) => (p.id === photoId ? photo : p)),
        }));
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '移除标签失败' });
    }
  },

  applyPendingDefaultTags: async (photoId) => {
    set({ error: null });
    try {
      const applied = await photoService.applyPendingDefaultTagsOnDetailOpen(photoId);
      const photo = await photoService.getPhoto(photoId);
      if (photo) {
        set((s) => ({
          photos: s.photos.map((p) => (p.id === photoId ? photo : p)),
        }));
      }
      return applied;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '应用默认标签失败' });
      return false;
    }
  },

  repairPhotoUri: async (photoId) => {
    set({ error: null });
    try {
      const repaired = await photoService.repairPhotoUriFromSourceAsset(photoId);
      if (!repaired) return false;
      set((s) => ({
        photos: s.photos.map((p) => (p.id === photoId ? repaired : p)),
      }));
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '修复照片资源失败' });
      return false;
    }
  },

  linkPhotoToResolvedItem: async (photoId, item) => {
    set({ error: null });
    try {
      const linked = await photoService.linkPhotoToResolvedItem(photoId, item);
      if (!linked) return null;
      set((s) => ({
        photos: s.photos.map((p) => (p.id === photoId ? linked : p)),
      }));
      return linked;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '手动关联照片失败' });
      return null;
    }
  },

  setQueryOptions: (opts) => set({ queryOptions: opts }),
  clearError: () => set({ error: null }),
}));

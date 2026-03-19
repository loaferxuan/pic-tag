import { create } from 'zustand';
import type { Photo } from '@/shared/types/domain';
import * as photoService from '@/features/photo/services/photo.service';

interface PhotoDetailState {
  currentPhoto: Photo | null;
  loading: boolean;
  error: string | null;
  primePhoto: (photo: Photo | null) => void;
  loadPhoto: (id: number, options?: { silent?: boolean }) => Promise<void>;
  clearCurrent: () => void;
  clearError: () => void;
}

export const usePhotoDetailStore = create<PhotoDetailState>((set) => {
  let activeRequestId = 0;

  return {
    currentPhoto: null,
    loading: false,
    error: null,

    primePhoto: (photo) => {
      activeRequestId += 1;
      set({
        currentPhoto: photo,
        loading: false,
        error: null,
      });
    },

    loadPhoto: async (id, options) => {
      const requestId = activeRequestId + 1;
      activeRequestId = requestId;
      const silent = options?.silent === true;

      if (silent) {
        set({ error: null });
      } else {
        set({ loading: true, error: null });
      }

      try {
        const currentPhoto = await photoService.getPhoto(id);
        if (requestId !== activeRequestId) return;
        set({ currentPhoto });
      } catch (error) {
        if (requestId !== activeRequestId) return;
        set((state) => ({
          error: error instanceof Error ? error.message : '鍔犺浇澶辫触',
          currentPhoto: silent ? state.currentPhoto : null,
        }));
      } finally {
        if (!silent && requestId === activeRequestId) {
          set({ loading: false });
        }
      }
    },

    clearCurrent: () => {
      activeRequestId += 1;
      set({
        currentPhoto: null,
        loading: false,
        error: null,
      });
    },

    clearError: () => set({ error: null }),
  };
});

import { create } from 'zustand';
import type { SearchFilters } from '@/shared/types/domain';

type SortField = 'imported_at' | 'taken_date' | 'filename' | 'id';
type SortDir = 'ASC' | 'DESC';

interface UIState {
  searchFilters: SearchFilters;
  sortField: SortField;
  sortDir: SortDir;

  setSearchFilters: (filters: SearchFilters | ((prev: SearchFilters) => SearchFilters)) => void;
  setSort: (field: SortField, dir?: SortDir) => void;
  resetFilters: () => void;
}

const defaultFilters: SearchFilters = {};

export const useUIStore = create<UIState>((set) => ({
  searchFilters: defaultFilters,
  sortField: 'taken_date',
  sortDir: 'DESC',

  setSearchFilters: (filters) =>
    set((s) => ({
      searchFilters: typeof filters === 'function' ? filters(s.searchFilters) : filters,
    })),

  setSort: (field, dir) =>
    set({ sortField: field, sortDir: dir ?? 'DESC' }),

  resetFilters: () =>
    set({
      searchFilters: defaultFilters,
      sortField: 'taken_date',
      sortDir: 'DESC',
    }),
}));

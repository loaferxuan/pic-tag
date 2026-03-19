import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert, TextInput, Modal, InteractionManager } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Sharing from 'expo-sharing';
import { usePhotoStore } from '@/features/photo/store/photo.store';
import { usePhotoDetailStore } from '@/features/photo/store/photo-detail.store';
import { useTagStore } from '@/features/tag/store/tag.store';
import { PhotoImporter } from '@/features/photo/components/PhotoImporter';
import { TagBadge } from '@/features/tag/components/TagBadge';
import { TagCategorySection } from '@/features/tag/components/TagCategorySection';
import { Button } from '@/shared/ui/Button';
import { PHOTO_STORAGE_MISSING_FILE_NOTICE } from '@/features/settings/services/photo-storage-notice.service';
import { PHOTO_NOTES_MAX_LENGTH, UNCATEGORIZED_TAG_CATEGORY_ID } from '@/shared/constants';
import { formatDate, formatFileSize, toDateFromStoredDate, toStoredDate } from '@/shared/utils/format';
import { isValidHexColor, normalizeHexColor, sanitizeColorInput } from '@/shared/utils/color';
import { normalizeEditableNotes, validateNotesLength } from '@/shared/utils/photo-notes';
import type { Tag } from '@/shared/types/domain';
import type { PhotoImportItem } from '@/features/photo/services/photo.service';
import {
  mergeTagCategoryCollapsedState,
  type TagCategoryCollapsedState,
} from '@/shared/utils/tag-category-collapse';

const NOTES_AUTOSAVE_DEBOUNCE_MS = 600;
const NOTES_SAVED_HINT_MS = 1500;
const QUICK_TAG_DEFAULT_COLOR = '#808080'; // 默认灰色
const QUICK_TAG_COLOR_PRESETS = [
  '#FF0000', // 红色
  '#FFFF00', // 黄色
  '#0000FF', // 蓝色
  '#7FDBFF', // 水色
  '#008000', // 绿色
  '#FFA500', // 橙色
  '#800080', // 紫色
  '#FFFFFF', // 白色
  '#000000', // 黑色
  '#808080', // 灰色
  '#FFC0CB', // 粉色
];

type NotesSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function PhotoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const photoId = id ? parseInt(id, 10) : null;
  const currentPhoto = usePhotoDetailStore((s) => s.currentPhoto);
  const loading = usePhotoDetailStore((s) => s.loading);
  const error = usePhotoDetailStore((s) => s.error);
  const loadDetailPhoto = usePhotoDetailStore((s) => s.loadPhoto);
  const clearDetailCurrent = usePhotoDetailStore((s) => s.clearCurrent);
  const updatePhoto = usePhotoStore((s) => s.updatePhoto);
  const applyPendingDefaultTags = usePhotoStore((s) => s.applyPendingDefaultTags);
  const deletePhoto = usePhotoStore((s) => s.deletePhoto);
  const repairPhotoUri = usePhotoStore((s) => s.repairPhotoUri);
  const linkPhotoToResolvedItem = usePhotoStore((s) => s.linkPhotoToResolvedItem);
  const setPhotoTags = usePhotoStore((s) => s.setPhotoTags);
  const createTag = useTagStore((s) => s.createTag);
  const tags = useTagStore((s) => s.tags);
  const categories = useTagStore((s) => s.categories);
  const tagsByCategory = useTagStore((s) => s.tagsByCategory);
  const tagLibraryLoading = useTagStore((s) => s.loading);
  const ensureTagsByIds = useTagStore((s) => s.ensureTagsByIds);
  const reloadTagsWithCategories = useTagStore((s) => s.loadTagsWithCategories);

  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<TagCategoryCollapsedState>({});
  const [takenDateDraft, setTakenDateDraft] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [savingTakenDate, setSavingTakenDate] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [sharingPhoto, setSharingPhoto] = useState(false);
  const [takenDateError, setTakenDateError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesSaveStatus, setNotesSaveStatus] = useState<NotesSaveStatus>('idle');
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [resolvedPhotoId, setResolvedPhotoId] = useState<number | null>(null);
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [quickTagName, setQuickTagName] = useState('');
  const [quickTagCategoryId, setQuickTagCategoryId] = useState<number | null>(null);
  const [quickTagColor, setQuickTagColor] = useState(QUICK_TAG_DEFAULT_COLOR);
  const [creatingQuickTag, setCreatingQuickTag] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [showTagLibrary, setShowTagLibrary] = useState(false);
  const autoAppliedDefaultTagsPhotoIdsRef = useRef<Set<number>>(new Set());
  const attemptedPhotoUriRepairRef = useRef<Set<number>>(new Set());
  const notesDraftRef = useRef('');
  const lastSavedNormalizedNotesRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const hasQueuedSaveRef = useRef(false);
  const isMountedRef = useRef(true);
  const commitNotesAutosaveRef = useRef<(force: boolean, options?: { silent?: boolean }) => Promise<void>>(async () => {});
  const activePhotoRef = useRef<{ id: number | null; uri: string | null }>({
    id: null,
    uri: null,
  });

  const photo = useMemo(() => {
    if (photoId == null || !currentPhoto) return null;
    return currentPhoto.id === photoId ? currentPhoto : null;
  }, [currentPhoto, photoId]);

  const reloadDetailPhoto = useCallback(async (targetPhotoId: number, options?: { silent?: boolean }) => {
    await usePhotoDetailStore
      .getState()
      .loadPhoto(targetPhotoId, options?.silent ? { silent: true } : undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const primedPhoto = usePhotoDetailStore.getState().currentPhoto;
    const hasPrimedPhoto = photoId != null && primedPhoto?.id === photoId;
    setResolvedPhotoId(hasPrimedPhoto ? photoId : null);

    if (photoId) {
      void loadDetailPhoto(photoId, hasPrimedPhoto ? { silent: true } : undefined).finally(() => {
        if (!cancelled) {
          setResolvedPhotoId(photoId);
        }
      });
    } else {
      setResolvedPhotoId(photoId);
      clearDetailCurrent();
    }

    return () => {
      cancelled = true;
    };
  }, [clearDetailCurrent, loadDetailPhoto, photoId]);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [photoId]);

  useEffect(() => {
    setCollapsedCategories({});
  }, [photoId]);

  useEffect(() => {
    setSelectedTagIds(photo?.tagIds ?? []);
  }, [photo?.id, photo?.tagIds?.join(',')]);

  useEffect(() => {
    if (!photo?.tagIds || photo.tagIds.length === 0) return;
    void ensureTagsByIds(photo.tagIds);
  }, [ensureTagsByIds, photo?.id, photo?.tagIds?.join(',')]);

  useEffect(() => {
    setTakenDateDraft(toDateFromStoredDate(photo?.takenDate));
    setShowDatePicker(false);
    setTakenDateError(null);
  }, [photo?.id, photo?.takenDate]);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [photo?.id, photo?.uri]);

  useEffect(() => {
    activePhotoRef.current = {
      id: photo?.id ?? null,
      uri: photo?.uri ?? null,
    };
  }, [photo?.id, photo?.uri]);

  const clearNotesDebounceTimer = useCallback(() => {
    if (!debounceTimerRef.current) return;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }, []);

  const clearSavedHintTimer = useCallback(() => {
    if (!savedHintTimerRef.current) return;
    clearTimeout(savedHintTimerRef.current);
    savedHintTimerRef.current = null;
  }, []);

  useEffect(() => {
    const nextNotes = photo?.notes ?? '';
    setNotesDraft(nextNotes);
    notesDraftRef.current = nextNotes;
    lastSavedNormalizedNotesRef.current = normalizeEditableNotes(photo?.notes);
    setNotesError(null);
    setNotesSaveStatus('idle');
    hasQueuedSaveRef.current = false;
    clearNotesDebounceTimer();
    clearSavedHintTimer();
  }, [photo?.id, clearNotesDebounceTimer, clearSavedHintTimer]);

  useEffect(() => {
    if (!photo?.id) return;
    if (autoAppliedDefaultTagsPhotoIdsRef.current.has(photo.id)) return;
    autoAppliedDefaultTagsPhotoIdsRef.current.add(photo.id);
    void (async () => {
      const applied = await applyPendingDefaultTags(photo.id);
      if (applied) {
        await reloadDetailPhoto(photo.id, { silent: true });
      }
    })();
  }, [applyPendingDefaultTags, photo?.id, reloadDetailPhoto]);

  useEffect(() => {
    setShowTagLibrary(false);

    let cancelled = false;
    const interaction = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      startTransition(() => {
        setShowTagLibrary(true);
      });
      void reloadTagsWithCategories();
    });

    return () => {
      cancelled = true;
      interaction.cancel();
    };
  }, [photo?.id, reloadTagsWithCategories]);

  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const filteringSelected = showOnlySelected && selectedTagIds.length > 0;

  const originalTakenDate = photo?.takenDate ?? null;
  const normalizedTakenDate = useMemo(
    () => (takenDateDraft ? toStoredDate(takenDateDraft) : null),
    [takenDateDraft]
  );
  const canSaveTakenDate =
    !!photo &&
    !savingTakenDate &&
    !deletingPhoto &&
    normalizedTakenDate !== null &&
    normalizedTakenDate !== originalTakenDate;

  const normalizedDraftNotes = useMemo(() => normalizeEditableNotes(notesDraft), [notesDraft]);
  const notesValidation = useMemo(() => validateNotesLength(normalizedDraftNotes), [normalizedDraftNotes]);
  const notesLength = notesDraft.length;
  const notesStatusLabel = useMemo(() => {
    if (notesSaveStatus === 'saving') return '保存中...';
    if (notesSaveStatus === 'saved') return '已保存';
    return null;
  }, [notesSaveStatus]);

  const selectedDateLabel = takenDateDraft ? formatDate(takenDateDraft.toISOString(), 'yyyy-MM-dd') : '选择日期';

  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  const selectedTags = useMemo(
    () => selectedTagIds.map((tagId) => tagMap.get(tagId)).filter(Boolean) as Tag[],
    [selectedTagIds, tagMap]
  );
  const missingSelectedTagCount = selectedTagIds.length - selectedTags.length;
  const quickCreateCategoryOptions = useMemo(
    () => [{ id: null as number | null, name: '未分类' }, ...categories.map((category) => ({ id: category.id, name: category.name }))],
    [categories]
  );
  const normalizedQuickTagColor = useMemo(
    () => normalizeHexColor(quickTagColor, QUICK_TAG_DEFAULT_COLOR),
    [quickTagColor]
  );
  const quickTagNameError = quickTagName.trim().length === 0 ? '请输入标签名称' : null;
  const quickTagColorError = quickTagColor.length > 0 && !isValidHexColor(quickTagColor) ? '颜色格式需为 #RRGGBB' : null;
  const canCreateQuickTag =
    !deletingPhoto &&
    !creatingQuickTag &&
    quickTagNameError === null &&
    quickTagColorError === null;

  const categoryGroups = useMemo(() => {
    if (!showTagLibrary) return [];
    return categories
      .map((category) => {
        const sourceTags = (tagsByCategory.get(category.id) ?? []) as Tag[];
        const visibleTags = filteringSelected
          ? sourceTags.filter((tag) => selectedSet.has(tag.id))
          : sourceTags;
        return { category, tags: visibleTags };
      })
      .filter((group) => group.tags.length > 0);
  }, [categories, tagsByCategory, filteringSelected, selectedSet, showTagLibrary]);

  const uncategorizedTags = useMemo(() => {
    if (!showTagLibrary) return [];
    const sourceTags = (tagsByCategory.get(UNCATEGORIZED_TAG_CATEGORY_ID) ?? []) as Tag[];
    return filteringSelected
      ? sourceTags.filter((tag) => selectedSet.has(tag.id))
      : sourceTags;
  }, [tagsByCategory, filteringSelected, selectedSet, showTagLibrary]);
  const categorySnapshots = useMemo(
    () => [
      ...categoryGroups.map(({ category, tags: visibleTags }) => ({
        categoryId: category.id,
        tagCount: visibleTags.length,
      })),
      ...(uncategorizedTags.length > 0
        ? [{ categoryId: UNCATEGORIZED_TAG_CATEGORY_ID, tagCount: uncategorizedTags.length }]
        : []),
    ],
    [categoryGroups, uncategorizedTags]
  );

  useEffect(() => {
    setCollapsedCategories((prev) => mergeTagCategoryCollapsedState(prev, categorySnapshots));
  }, [categorySnapshots]);

  const hasVisibleLibraryTags = categoryGroups.length > 0 || uncategorizedTags.length > 0;
  const isPhotoLinked = !!photo && photo.uri.trim().length > 0;
  const shouldShowPhotoPlaceholder = !isPhotoLinked || imageLoadFailed;
  const isResolvingPhoto = photoId != null && resolvedPhotoId !== photoId && !photo;

  const metadataLines = useMemo(() => {
    if (!photo) return [];
    const unknownLabel = '\u672a\u77e5';
    const fileNameLabel = photo.filename.trim().length > 0 ? photo.filename : unknownLabel;
    const resolutionLabel = photo.width > 0 && photo.height > 0 ? `${photo.width} x ${photo.height}` : unknownLabel;
    const fileSizeLabel = photo.fileSize > 0 ? formatFileSize(photo.fileSize) : unknownLabel;
    const takenDateLabel = photo.takenDate ? formatDate(photo.takenDate, 'yyyy-MM-dd') : unknownLabel;
    const fileLocationLabel = photo.uri.trim().length > 0 ? photo.uri : unknownLabel;

    return [
      `\u6587\u4ef6\u540d\uff1a${fileNameLabel}`,
      `\u5206\u8fa8\u7387\uff1a${resolutionLabel}`,
      `\u6587\u4ef6\u5927\u5c0f\uff1a${fileSizeLabel}`,
      `\u62cd\u6444\u65e5\u671f\uff1a${takenDateLabel}`,
      `\u6587\u4ef6\u4f4d\u7f6e\uff1a${fileLocationLabel}`,
    ];
  }, [photo]);

  const showPhotoMetadata = useCallback(() => {
    if (!photo) return;
    Alert.alert('\u4fe1\u606f', metadataLines.join('\n'));
  }, [metadataLines, photo]);

  const handleSharePhoto = useCallback(async () => {
    if (!photo || deletingPhoto || sharingPhoto) return;
    const shareUri = photo.uri.trim();
    if (!shareUri) {
      Alert.alert('\u65e0\u6cd5\u5206\u4eab', '\u5f53\u524d\u7167\u7247\u7f3a\u5c11\u53ef\u5206\u4eab\u8d44\u6e90');
      return;
    }

    setSharingPhoto(true);
    try {
      const shareAvailable = await Sharing.isAvailableAsync();
      if (!shareAvailable) {
        Alert.alert('\u65e0\u6cd5\u5206\u4eab', '\u5f53\u524d\u8bbe\u5907\u4e0d\u652f\u6301\u7cfb\u7edf\u5206\u4eab');
        return;
      }

      await Sharing.shareAsync(shareUri, {
        dialogTitle: '\u5206\u4eab\u5230\u5fae\u535a',
        mimeType: photo.mimeType ?? undefined,
        UTI: 'public.image',
      });
    } catch {
      Alert.alert('\u5206\u4eab\u5931\u8d25', '\u5206\u4eab\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5');
    } finally {
      setSharingPhoto(false);
    }
  }, [deletingPhoto, photo, sharingPhoto]);

  const handleImageError = useCallback(() => {
    const failedPhotoId = photo?.id ?? null;
    const failedPhotoUri = photo?.uri ?? null;
    const activePhoto = activePhotoRef.current;
    if (failedPhotoId == null || activePhoto.id !== failedPhotoId || activePhoto.uri !== failedPhotoUri) {
      return;
    }

    setImageLoadFailed(true);
    if (!photo?.id || !photo.sourceAssetId) return;
    if (attemptedPhotoUriRepairRef.current.has(photo.id)) return;
    attemptedPhotoUriRepairRef.current.add(photo.id);
    void (async () => {
      const repaired = await repairPhotoUri(photo.id);
      if (repaired) {
        await reloadDetailPhoto(photo.id, { silent: true });
      }
    })();
  }, [photo?.id, photo?.sourceAssetId, photo?.uri, reloadDetailPhoto, repairPhotoUri]);

  const handleManualLinkPhoto = useCallback(
    async (item: PhotoImportItem) => {
      if (!photo?.id || deletingPhoto) return;
      const linked = await linkPhotoToResolvedItem(photo.id, item);
      const latestError = usePhotoStore.getState().error;
      if (!linked || latestError) {
        throw new Error(latestError ?? '手动关联失败');
      }
      await reloadDetailPhoto(photo.id, { silent: true });
    },
    [deletingPhoto, linkPhotoToResolvedItem, photo?.id, reloadDetailPhoto]
  );

  const applyTags = async (next: number[]) => {
    if (!photo || deletingPhoto) return;
    setSelectedTagIds(next);
    setSavingTags(true);
    try {
      await setPhotoTags(photo.id, next);
      if (!usePhotoStore.getState().error) {
        await reloadDetailPhoto(photo.id, { silent: true });
      }
    } finally {
      setSavingTags(false);
    }
  };

  const toggleTag = (tagId: number) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    void applyTags(next);
  };

  const toggleCategoryCollapsed = useCallback((categoryId: number) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !(prev[categoryId] ?? false),
    }));
  }, []);

  const removeSelectedTag = (tagId: number) => {
    if (!selectedTagIds.includes(tagId)) return;
    void applyTags(selectedTagIds.filter((id) => id !== tagId));
  };

  const clearAllTags = () => {
    if (selectedTagIds.length === 0) return;
    void applyTags([]);
  };

  const resetQuickCreateForm = useCallback(() => {
    setQuickTagName('');
    setQuickTagCategoryId(null);
    setQuickTagColor(QUICK_TAG_DEFAULT_COLOR);
    setQuickCreateError(null);
  }, []);

  const openQuickCreateModal = () => {
    if (deletingPhoto) return;
    resetQuickCreateForm();
    setShowQuickCreateModal(true);
  };

  const closeQuickCreateModal = () => {
    if (creatingQuickTag) return;
    setShowQuickCreateModal(false);
    resetQuickCreateForm();
  };

  const handleCreateQuickTag = async () => {
    if (!photo || deletingPhoto || creatingQuickTag) return;

    const name = quickTagName.trim();
    if (!name) {
      setQuickCreateError('请输入标签名称');
      return;
    }

    if (quickTagColor.length > 0 && !isValidHexColor(quickTagColor)) {
      setQuickCreateError('颜色格式需为 #RRGGBB');
      return;
    }

    setCreatingQuickTag(true);
    setQuickCreateError(null);

    try {
      const created = await createTag({
        name,
        categoryId: quickTagCategoryId,
        color: normalizeHexColor(quickTagColor, QUICK_TAG_DEFAULT_COLOR),
      });

      if (!created) {
        const latestError = useTagStore.getState().error;
        setQuickCreateError(latestError ?? '创建标签失败，请稍后重试。');
        return;
      }

      await reloadTagsWithCategories();
      const nextTagIds = Array.from(new Set([...selectedTagIds, created.id]));
      await applyTags(nextTagIds);
      setShowQuickCreateModal(false);
      resetQuickCreateForm();
    } finally {
      setCreatingQuickTag(false);
    }
  };

  const openDatePicker = () => {
    if (deletingPhoto || savingTakenDate) return;
    setTakenDateError(null);
    setShowDatePicker(true);
  };

  const saveTakenDate = async (nextTakenDate: string) => {
    if (!photo || deletingPhoto || savingTakenDate) return;

    setSavingTakenDate(true);
    setTakenDateError(null);
    try {
      await updatePhoto(photo.id, { takenDate: nextTakenDate });
      const latestError = usePhotoStore.getState().error;
      if (latestError) {
        setTakenDateError(latestError);
      } else {
        await reloadDetailPhoto(photo.id, { silent: true });
      }
    } finally {
      setSavingTakenDate(false);
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate) return;

    const next = new Date(selectedDate);
    next.setHours(0, 0, 0, 0);
    const nextTakenDate = toStoredDate(next);
    setTakenDateDraft(next);
    setTakenDateError(null);

    if (Platform.OS === 'android' && nextTakenDate !== originalTakenDate) {
      void saveTakenDate(nextTakenDate);
    }
  };

  const handleSaveTakenDate = async () => {
    if (!photo || !normalizedTakenDate || deletingPhoto) return;
    await saveTakenDate(normalizedTakenDate);
  };

  const commitNotesAutosave = useCallback(
    async (force: boolean, options?: { silent?: boolean }) => {
      if (!photo?.id || deletingPhoto) return;

      if (isSavingRef.current) {
        hasQueuedSaveRef.current = true;
        return;
      }

      let shouldContinue = true;
      while (shouldContinue) {
        shouldContinue = false;
        hasQueuedSaveRef.current = false;

        const normalizedDraft = normalizeEditableNotes(notesDraftRef.current);
        const validation = validateNotesLength(normalizedDraft);
        if (!validation.valid) {
          if (!options?.silent && isMountedRef.current) {
            clearSavedHintTimer();
            setNotesError(validation.message);
            setNotesSaveStatus('error');
          }
          return;
        }

        if (normalizedDraft === lastSavedNormalizedNotesRef.current) {
          return;
        }

        isSavingRef.current = true;
        if (!options?.silent && isMountedRef.current) {
          clearSavedHintTimer();
          setNotesError(null);
          setNotesSaveStatus('saving');
        }

        try {
          await updatePhoto(photo.id, { notes: normalizedDraft });
          const latestError = usePhotoStore.getState().error;
          if (latestError) {
            if (!options?.silent && isMountedRef.current) {
              setNotesError(latestError);
              setNotesSaveStatus('error');
            }
          } else {
            await reloadDetailPhoto(photo.id, { silent: true });
            lastSavedNormalizedNotesRef.current = normalizedDraft;
            if (!options?.silent && isMountedRef.current) {
              setNotesError(null);
              setNotesSaveStatus('saved');
              clearSavedHintTimer();
              savedHintTimerRef.current = setTimeout(() => {
                if (!isMountedRef.current) return;
                setNotesSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
              }, NOTES_SAVED_HINT_MS);
            }
          }
        } catch (e) {
          if (!options?.silent && isMountedRef.current) {
            setNotesError(e instanceof Error ? e.message : '保存备注失败');
            setNotesSaveStatus('error');
          }
        } finally {
          isSavingRef.current = false;
        }

        if (hasQueuedSaveRef.current) {
          force = true;
          shouldContinue = true;
        }

        if (!force) {
          return;
        }
      }
    },
    [clearSavedHintTimer, deletingPhoto, photo?.id, reloadDetailPhoto, updatePhoto]
  );

  const scheduleNotesAutosave = useCallback(() => {
    if (!photo?.id || deletingPhoto) return;
    clearNotesDebounceTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void commitNotesAutosave(false);
    }, NOTES_AUTOSAVE_DEBOUNCE_MS);
  }, [clearNotesDebounceTimer, commitNotesAutosave, deletingPhoto, photo?.id]);

  const flushNotesAutosave = useCallback(
    (options?: { silent?: boolean }) => {
      if (!photo?.id || deletingPhoto) return;
      clearNotesDebounceTimer();
      void commitNotesAutosave(true, options);
    },
    [clearNotesDebounceTimer, commitNotesAutosave, deletingPhoto, photo?.id]
  );

  const handleNotesChange = (nextValue: string) => {
    notesDraftRef.current = nextValue;
    setNotesDraft(nextValue);
    const normalizedNext = normalizeEditableNotes(nextValue);
    const nextValidation = validateNotesLength(normalizedNext);
    if (!nextValidation.valid) {
      clearNotesDebounceTimer();
      clearSavedHintTimer();
      setNotesError(nextValidation.message);
      setNotesSaveStatus('error');
      return;
    }

    setNotesError(null);
    setNotesSaveStatus((prev) => (prev === 'saving' ? prev : 'idle'));
    scheduleNotesAutosave();
  };

  const handleNotesBlur = () => {
    flushNotesAutosave();
  };

  useFocusEffect(
    useCallback(() => {
      return () => {
        flushNotesAutosave();
      };
    }, [flushNotesAutosave])
  );

  useEffect(() => {
    commitNotesAutosaveRef.current = commitNotesAutosave;
  }, [commitNotesAutosave]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearNotesDebounceTimer();
      clearSavedHintTimer();
      void commitNotesAutosaveRef.current(true, { silent: true });
    };
  }, [clearNotesDebounceTimer, clearSavedHintTimer]);

  const handleConfirmDelete = async () => {
    if (!photo || deletingPhoto) return;

    setDeletingPhoto(true);
    try {
      const success = await deletePhoto(photo.id);
      if (success) {
        clearDetailCurrent();
        router.back();
        return;
      }
      const latestError = usePhotoStore.getState().error;
      Alert.alert('删除失败', latestError ?? '删除照片失败。');
    } finally {
      setDeletingPhoto(false);
    }
  };

  const handleDeletePress = () => {
    if (!photo || deletingPhoto) return;
    Alert.alert(
      '删除照片记录',
      '仅删除本应用内的照片记录、标签关联和备注，不会删除系统相册中的原图。是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            void handleConfirmDelete();
          },
        },
      ]
    );
  };

  const shareDisabled = !photo || !isPhotoLinked || deletingPhoto || sharingPhoto;

  if (isResolvingPhoto || (loading && !photo)) {
    return (
      <>
        <Stack.Screen options={{ headerRight: () => null }} />
        <View style={styles.center}>
          <Text style={styles.muted}>加载中...</Text>
        </View>
      </>
    );
  }

  if (!photo) {
    return (
      <>
        <Stack.Screen options={{ headerRight: () => null }} />
        <View style={styles.center}>
          <Text style={styles.error}>{error || '未找到照片'}</Text>
          <Button title="返回" onPress={() => router.back()} variant="outline" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActionRow}>
              <TouchableOpacity
                style={[styles.headerShareButton, shareDisabled && styles.headerActionDisabled]}
                onPress={() => {
                  void handleSharePhoto();
                }}
                activeOpacity={0.7}
                disabled={shareDisabled}
              >
                <Text style={styles.headerShareButtonText}>分享</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerMetadataButton} onPress={showPhotoMetadata} activeOpacity={0.7}>
                <Text style={styles.headerMetadataButtonText}>详</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {shouldShowPhotoPlaceholder ? (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderTitle}>原照片文件当前不可用</Text>
          <Text style={styles.imagePlaceholderHint}>{PHOTO_STORAGE_MISSING_FILE_NOTICE}</Text>
          <Text style={styles.imagePlaceholderHint}>请通过“手动关联照片”重新选择设备中的图片。</Text>
          <View style={styles.imagePlaceholderAction}>
            <PhotoImporter
              mode="select"
              multi={false}
              buttonTitle="手动关联照片"
              onSelectResolvedItem={handleManualLinkPhoto}
              disabled={deletingPhoto}
            />
          </View>
        </View>
      ) : (
        <Image
          source={{ uri: photo.uri }}
          style={styles.image}
          resizeMode="contain"
          onError={handleImageError}
          fadeDuration={0}
        />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>拍摄日期</Text>

        <Button
          title={selectedDateLabel}
          onPress={openDatePicker}
          variant="outline"
          disabled={deletingPhoto || savingTakenDate}
          loading={savingTakenDate}
          style={styles.dateButton}
        />

        {!takenDateDraft ? <Text style={styles.emptyHint}>尚未设置拍摄日期。</Text> : null}

        {takenDateError ? <Text style={styles.validationText}>{takenDateError}</Text> : null}

        {showDatePicker ? (
          <View style={styles.dateTimePickerWrap}>
            <DateTimePicker value={takenDateDraft ?? new Date()} mode="date" display="default" onChange={handleDateChange} />
          </View>
        ) : null}

        {Platform.OS === 'ios' ? (
          <Button
            title="保存拍摄日期"
            onPress={handleSaveTakenDate}
            loading={savingTakenDate}
            disabled={!canSaveTakenDate}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>备注</Text>

        <TextInput
          style={[styles.notesInput, deletingPhoto && styles.notesInputDisabled]}
          value={notesDraft}
          onChangeText={handleNotesChange}
          onBlur={handleNotesBlur}
          placeholder="输入照片备注..."
          placeholderTextColor="#9ca3af"
          editable={!deletingPhoto}
          multiline
          textAlignVertical="top"
        />

        <View style={styles.notesMetaRow}>
          {notesStatusLabel ? (
            <Text
              style={[
                styles.notesStatusText,
                notesSaveStatus === 'saving' && styles.notesStatusSaving,
                notesSaveStatus === 'saved' && styles.notesStatusSaved,
              ]}
            >
              {notesStatusLabel}
            </Text>
          ) : (
            <View />
          )}
          <Text style={[styles.notesCounter, notesLength > PHOTO_NOTES_MAX_LENGTH && styles.notesCounterError]}>
            {notesLength}/{PHOTO_NOTES_MAX_LENGTH}
          </Text>
        </View>

        {notesError ? <Text style={styles.validationText}>{notesError}</Text> : null}
        {!notesError && !notesValidation.valid ? <Text style={styles.validationText}>{notesValidation.message}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>当前标签</Text>
        <Text style={styles.sectionHint}>
          已选择：{selectedTagIds.length}{savingTags ? '（保存中...）' : ''}
        </Text>

        {selectedTags.length > 0 ? (
          <View style={styles.selectedTagRow}>
            {selectedTags.map((tag) => (
              <TagBadge
                key={tag.id}
                tag={tag}
                selected
                onPress={() => removeSelectedTag(tag.id)}
                size="small"
              />
            ))}
          </View>
        ) : null}

        {selectedTagIds.length === 0 ? (
          <Text style={styles.emptyHint}>这张照片还没有标签。</Text>
        ) : null}

        {missingSelectedTagCount > 0 ? (
          <Text style={styles.emptyHint}>
            {selectedTags.length === 0
              ? `已选择 ${selectedTagIds.length} 个标签，标签信息加载中...`
              : `剩余 ${missingSelectedTagCount} 个标签信息加载中...`}
          </Text>
        ) : null}

        {selectedTagIds.length > 0 ? (
          <Button title="清空照片标签" onPress={clearAllTags} variant="outline" disabled={deletingPhoto} />
        ) : null}
      </View>

      {showTagLibrary ? (
        <>
          <View style={styles.section}>
            <View style={styles.libraryHeaderRow}>
              <View style={styles.libraryHeaderTextWrap}>
                <Text style={styles.sectionTitle}>标签库</Text>
                <Text style={styles.sectionHint}>点按下方标签可添加或移除。</Text>
              </View>
              <View style={styles.libraryActionGroup}>
                <TouchableOpacity
                  style={[styles.quickCreateButton, deletingPhoto && styles.headerActionDisabled]}
                  onPress={openQuickCreateModal}
                  activeOpacity={0.7}
                  disabled={deletingPhoto}
                >
                  <Text style={styles.quickCreateButtonText}>新建标签</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterButton, showOnlySelected && styles.filterButtonActive]}
                  onPress={() => {
                    if (deletingPhoto) return;
                    setShowOnlySelected((v) => !v);
                  }}
                  activeOpacity={0.7}
                  disabled={deletingPhoto}
                >
                  <Text style={[styles.filterButtonText, showOnlySelected && styles.filterButtonTextActive]}>
                    {showOnlySelected ? '显示全部' : '仅看已选'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {showOnlySelected && selectedTagIds.length === 0 ? (
              <Text style={styles.emptyHint}>当前没有已选标签，已显示完整标签库。</Text>
            ) : null}

            {tagLibraryLoading ? <Text style={styles.emptyHint}>标签库加载中...</Text> : null}

            {!tagLibraryLoading && tags.length === 0 ? (
              <Text style={styles.emptyHint}>还没有标签。可点击右上角“新建标签”快速创建。</Text>
            ) : null}

            {tags.length > 0 && !hasVisibleLibraryTags && filteringSelected ? (
              <Text style={styles.emptyHint}>没有可显示的已选标签。</Text>
            ) : null}

            {categoryGroups.map(({ category, tags: visibleTags }) => (
              <TagCategorySection
                key={category.id}
                category={category}
                tags={visibleTags}
                selectedTagIds={selectedTagIds}
                onTagPress={deletingPhoto ? () => {} : toggleTag}
                collapsible
                collapsed={collapsedCategories[category.id] ?? false}
                onToggleCollapsed={() => toggleCategoryCollapsed(category.id)}
              />
            ))}

            {uncategorizedTags.length > 0 ? (
              <TagCategorySection
                category={{
                  id: UNCATEGORIZED_TAG_CATEGORY_ID,
                  externalId: '__uncategorized__',
                  name: '未分类',
                  color: '#9ca3af',
                  sortOrder: 999,
                  createdAt: '',
                }}
                tags={uncategorizedTags}
                selectedTagIds={selectedTagIds}
                onTagPress={deletingPhoto ? () => {} : toggleTag}
                collapsible
                collapsed={collapsedCategories[UNCATEGORIZED_TAG_CATEGORY_ID] ?? false}
                onToggleCollapsed={() => toggleCategoryCollapsed(UNCATEGORIZED_TAG_CATEGORY_ID)}
              />
            ) : null}
          </View>

          {showQuickCreateModal ? (
            <Modal visible={showQuickCreateModal} animationType="slide" transparent onRequestClose={closeQuickCreateModal}>
              <View style={styles.quickCreateModalOverlay}>
                <TouchableOpacity
                  style={StyleSheet.absoluteFillObject}
                  activeOpacity={1}
                  onPress={closeQuickCreateModal}
                  disabled={creatingQuickTag}
                />
                <View style={styles.quickCreateModalCard}>
                  <Text style={styles.quickCreateModalTitle}>快速新建标签</Text>
                  <Text style={styles.quickCreateModalHint}>创建成功后会自动添加到当前照片。</Text>

                  <Text style={styles.quickCreateLabel}>标签名称</Text>
                  <TextInput
                    style={styles.quickCreateInput}
                    value={quickTagName}
                    onChangeText={(text) => {
                      setQuickTagName(text);
                      if (quickCreateError) setQuickCreateError(null);
                    }}
                    placeholder="输入标签名称"
                    placeholderTextColor="#9ca3af"
                    editable={!creatingQuickTag}
                    autoCapitalize="none"
                  />

                  <Text style={styles.quickCreateLabel}>所属分类</Text>
                  <View style={styles.quickCreateSelectorWrap}>
                    {quickCreateCategoryOptions.map((option) => {
                      const selected = quickTagCategoryId === option.id;
                      return (
                        <TouchableOpacity
                          key={`quick-create-category-${option.id ?? -1}`}
                          style={[styles.quickCreateSelectorChip, selected && styles.quickCreateSelectorChipSelected]}
                          onPress={() => {
                            setQuickTagCategoryId(option.id);
                            if (quickCreateError) setQuickCreateError(null);
                          }}
                          activeOpacity={0.7}
                          disabled={creatingQuickTag}
                        >
                          <Text style={[styles.quickCreateSelectorText, selected && styles.quickCreateSelectorTextSelected]}>
                            {option.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.quickCreateLabel}>标签颜色</Text>
                  <View style={styles.quickCreateColorInputRow}>
                    <View style={[styles.quickCreateColorPreview, { backgroundColor: normalizedQuickTagColor }]} />
                    <TextInput
                      style={[styles.quickCreateInput, styles.quickCreateColorInput]}
                      value={quickTagColor}
                      onChangeText={(text) => {
                        setQuickTagColor(sanitizeColorInput(text));
                        if (quickCreateError) setQuickCreateError(null);
                      }}
                      placeholder="#808080"
                      placeholderTextColor="#9ca3af"
                      maxLength={7}
                      editable={!creatingQuickTag}
                      autoCorrect={false}
                      autoCapitalize="characters"
                    />
                  </View>
                  <View style={styles.quickCreatePresetWrap}>
                    {QUICK_TAG_COLOR_PRESETS.map((preset) => {
                      const selected = normalizedQuickTagColor === preset;
                      return (
                        <TouchableOpacity
                          key={`quick-create-color-${preset}`}
                          style={[styles.quickCreatePresetItem, selected && styles.quickCreatePresetItemSelected]}
                          onPress={() => {
                            setQuickTagColor(preset);
                            if (quickCreateError) setQuickCreateError(null);
                          }}
                          activeOpacity={0.7}
                          disabled={creatingQuickTag}
                        >
                          <View style={[styles.quickCreatePresetColor, { backgroundColor: preset }]} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {quickCreateError ? <Text style={styles.validationText}>{quickCreateError}</Text> : null}
                  {!quickCreateError && quickTagNameError ? <Text style={styles.validationText}>{quickTagNameError}</Text> : null}
                  {!quickCreateError && !quickTagNameError && quickTagColorError ? (
                    <Text style={styles.validationText}>{quickTagColorError}</Text>
                  ) : null}

                  <View style={styles.quickCreateModalActions}>
                    <Button
                      title="取消"
                      onPress={closeQuickCreateModal}
                      variant="outline"
                      style={styles.flexButton}
                      disabled={creatingQuickTag}
                    />
                    <View style={styles.gap} />
                    <Button
                      title="创建并添加"
                      onPress={() => {
                        void handleCreateQuickTag();
                      }}
                      loading={creatingQuickTag}
                      disabled={!canCreateQuickTag}
                      style={styles.flexButton}
                    />
                  </View>
                </View>
              </View>
            </Modal>
          ) : null}

          <View style={styles.actions}>
            <Button
              title="删除照片"
              onPress={handleDeletePress}
              variant="outline"
              style={styles.dangerButton}
              textStyle={styles.dangerButtonText}
              loading={deletingPhoto}
              disabled={deletingPhoto}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  muted: { color: '#6b7280', fontSize: 14 },
  error: { color: '#dc2626', marginBottom: 12 },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  imagePlaceholderTitle: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  imagePlaceholderHint: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  imagePlaceholderAction: {
    width: '100%',
    maxWidth: 320,
    marginTop: 12,
  },
  section: { padding: 16, paddingTop: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#111827' },
  sectionHint: { color: '#6b7280', fontSize: 13, marginBottom: 10 },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerShareButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 13,
    paddingHorizontal: 10,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  headerShareButtonText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  headerMetadataButton: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  headerMetadataButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  notesInputDisabled: {
    backgroundColor: '#f1f5f9',
  },
  notesCounter: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 0,
    textAlign: 'right',
  },
  notesCounterError: {
    color: '#dc2626',
  },
  notesMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  notesStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  notesStatusSaving: {
    color: '#6b7280',
  },
  notesStatusSaved: {
    color: '#15803d',
  },
  dateButton: {
    marginBottom: 10,
  },
  dateTimePickerWrap: {
    marginBottom: 10,
  },
  validationText: {
    color: '#dc2626',
    fontSize: 12,
    marginBottom: 10,
  },
  emptyHint: { color: '#6b7280', fontSize: 14, marginBottom: 10 },
  selectedTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  libraryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  libraryHeaderTextWrap: {
    flex: 1,
  },
  libraryActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionDisabled: {
    opacity: 0.5,
  },
  quickCreateButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  quickCreateButtonText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  filterButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  filterButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  filterButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#1d4ed8',
  },
  quickCreateModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  quickCreateModalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  quickCreateModalTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  quickCreateModalHint: {
    color: '#64748b',
    fontSize: 13,
    marginBottom: 12,
  },
  quickCreateLabel: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  quickCreateInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    marginBottom: 10,
    ...Platform.select({
      android: {
        height: 44,
        paddingVertical: 0,
        textAlignVertical: 'center',
      },
      default: {
        paddingVertical: 10,
      },
    }),
  },
  quickCreateSelectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  quickCreateSelectorChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  quickCreateSelectorChipSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  quickCreateSelectorText: {
    color: '#334155',
    fontSize: 12,
  },
  quickCreateSelectorTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  quickCreateColorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickCreateColorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 10,
  },
  quickCreateColorInput: {
    flex: 1,
    marginBottom: 0,
  },
  quickCreatePresetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  quickCreatePresetItem: {
    width: 30,
    height: 30,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCreatePresetItemSelected: {
    borderColor: '#0f172a',
  },
  quickCreatePresetColor: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
  },
  quickCreateModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  flexButton: {
    flex: 1,
  },
  gap: {
    width: 10,
  },
  actions: { padding: 16 },
  dangerButton: {
    borderColor: '#dc2626',
  },
  dangerButtonText: {
    color: '#dc2626',
  },
});


import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, FlatList, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useTagsWithCategories } from '@/features/tag/hooks/useTags';
import { useTagStore } from '@/features/tag/store/tag.store';
import { TagCategorySection } from '@/features/tag/components/TagCategorySection';
import { TagBadge } from '@/features/tag/components/TagBadge';
import { TagColorEditor, isColorDraftValid } from '@/features/tag/components/TagColorEditor';
import { PresetManager } from '@/features/tag/components/PresetManager';
import { Button } from '@/shared/ui/Button';
import type { Tag, TagCategory } from '@/shared/types/domain';
import { normalizeHexColor, hexToRgba } from '@/shared/utils/color';
import * as presetService from '@/features/tag/services/tag-preset.service';
import { getRepositories } from '@/infra/db';
import { syncDefaultTagIdsFromPreset } from '@/features/tag/services/default-tag.service';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import Colors from '@/shared/theme/Colors';
import { BorderRadius, Spacing, FontSize } from '@/shared/theme/Theme';

const DEFAULT_COLOR = '#808080';
const UNCATEGORIZED_CATEGORY: TagCategory = {
  id: -1,
  externalId: '__uncategorized__',
  name: '未分类',
  color: '#9ca3af',
  sortOrder: 999,
  createdAt: '',
};

export default function TagManageScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const { tags, categories, tagsByCategory, loading, error, reload } = useTagsWithCategories();
  const createCategory = useTagStore((s) => s.createCategory);
  const updateCategory = useTagStore((s) => s.updateCategory);
  const deleteCategory = useTagStore((s) => s.deleteCategory);

  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState(DEFAULT_COLOR);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);

  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryColor, setEditingCategoryColor] = useState(DEFAULT_COLOR);
  const [savingCategory, setSavingCategory] = useState(false);

  const [presets, setPresets] = useState<presetService.TagPresetDisplay[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [showPresetSelector, setShowPresetSelector] = useState(false);
  const [existingPresetTags, setExistingPresetTags] = useState<Map<number, Array<{ itemId: number; tagId: number; name: string; color: string }>>>(new Map());

  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const canCreateCategory = categoryName.trim().length > 0 && isColorDraftValid(categoryColor);
  const canSaveCategory = editingCategoryName.trim().length > 0 && isColorDraftValid(editingCategoryColor);
  const uncategorizedCount = tagsByCategory.get(-1)?.length ?? 0;

  const activePresets = useMemo(() => presets.filter((p) => p.isActive), [presets]);

  const loadPresets = useCallback(async () => {
    setLoadingPresets(true);
    try {
      const data = await presetService.getAllPresets();
      setPresets(data);

      const repos = await getRepositories();
      const tagMapLocal = new Map<number, Array<{ itemId: number; tagId: number; name: string; color: string }>>();

      for (const preset of data) {
        const items = await repos.tagPreset.getItemsByPresetId(preset.id);
        const tagItems: Array<{ itemId: number; tagId: number; name: string; color: string }> = [];

        for (const item of items) {
          if (item.tag_id !== null) {
            const tag = tagMap.get(item.tag_id);
            if (tag) {
              tagItems.push({
                itemId: item.id,
                tagId: item.tag_id,
                name: tag.name,
                color: tag.color,
              });
            }
          }
        }

        tagMapLocal.set(preset.id, tagItems);
      }

      setExistingPresetTags(tagMapLocal);
    } finally {
      setLoadingPresets(false);
    }
  }, [tagMap]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    content: {
      padding: Spacing.lg,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    cardTitle: {
      fontSize: FontSize.lg,
      fontWeight: '600',
      marginBottom: Spacing.xs,
      color: themeColors.text,
    },
    cardAction: {
      fontSize: FontSize.sm,
      fontWeight: '500',
      color: themeColors.tint,
    },
    hintText: {
      fontSize: FontSize.sm,
      marginBottom: Spacing.md,
      lineHeight: 20,
      color: themeColors.textSecondary,
    },
    muted: {
      fontSize: FontSize.sm,
      marginBottom: Spacing.md,
      color: themeColors.textSecondary,
    },
    error: {
      fontSize: FontSize.sm,
      marginBottom: Spacing.md,
      color: themeColors.error,
    },
    selectedTagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    editorActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    flexButton: {
      flex: 1,
    },
    gap: {
      width: Spacing.md,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
      marginTop: Spacing.sm,
    },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      gap: Spacing.sm,
    },
    presetChipText: {
      fontSize: FontSize.sm,
      fontWeight: '500',
    },
    presetChipMeta: {
      fontSize: FontSize.xs,
    },
    sectionTitle: {
      fontSize: FontSize.lg,
      fontWeight: '600',
      marginTop: Spacing.lg,
      marginBottom: Spacing.md,
      color: themeColors.text,
    },
    input: {
      height: 48,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      fontSize: FontSize.md,
      borderWidth: 1,
      marginBottom: Spacing.md,
      backgroundColor: themeColors.surfaceHighlight,
      color: themeColors.text,
      borderColor: themeColors.border,
    },
    entryBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    manageBlock: {
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    manageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowMain: {
      flex: 1,
    },
    rowTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    rowColorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: Spacing.sm,
    },
    rowTitle: {
      fontSize: FontSize.md,
      fontWeight: '500',
      color: themeColors.text,
    },
    rowMeta: {
      fontSize: FontSize.xs,
      marginLeft: 18,
      color: themeColors.textSecondary,
    },
    actionText: {
      fontSize: FontSize.sm,
      fontWeight: '500',
      color: themeColors.tint,
    },
    actionLink: {
      fontSize: FontSize.sm,
      fontWeight: '500',
      marginLeft: Spacing.lg,
      color: themeColors.tint,
    },
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    editorWrap: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: themeColors.border,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    modalClose: {
      fontSize: FontSize.md,
      fontWeight: '500',
      color: themeColors.tint,
    },
    modalTitle: {
      fontSize: FontSize.lg,
      fontWeight: '600',
      color: themeColors.text,
    },
    presetList: {
      padding: Spacing.lg,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyText: {
      fontSize: FontSize.md,
      fontWeight: '600',
      marginBottom: Spacing.xs,
      color: themeColors.textSecondary,
    },
    emptyHint: {
      fontSize: FontSize.sm,
      color: themeColors.textTertiary,
    },
    defaultPresetCard: {
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      backgroundColor: hexToRgba(themeColors.tint, 0.08),
      borderColor: themeColors.tint,
    },
    defaultPresetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    defaultPresetBadge: {
      backgroundColor: hexToRgba(themeColors.tint, 0.1),
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      marginRight: Spacing.sm,
    },
    defaultPresetBadgeText: {
      fontSize: FontSize.xs,
      fontWeight: '600',
      color: themeColors.tint,
    },
    defaultPresetName: {
      fontSize: FontSize.lg,
      fontWeight: '600',
      flex: 1,
      color: themeColors.text,
    },
    defaultPresetCount: {
      fontSize: FontSize.sm,
      color: themeColors.textSecondary,
    },
    defaultPresetTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      marginBottom: Spacing.md,
    },
    defaultPresetMore: {
      fontSize: FontSize.sm,
      fontWeight: '500',
      alignSelf: 'center',
      color: themeColors.textTertiary,
    },
    removeDefaultBtn: {
      alignSelf: 'flex-start',
      paddingVertical: Spacing.xs,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    removeDefaultText: {
      fontSize: FontSize.sm,
      color: themeColors.textSecondary,
    },
    noDefaultCard: {
      backgroundColor: themeColors.surfaceHighlight,
      borderColor: themeColors.border,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      alignItems: 'center',
    },
    noDefaultText: {
      fontSize: FontSize.md,
      marginBottom: Spacing.xs,
      color: themeColors.textSecondary,
    },
    noDefaultHint: {
      fontSize: FontSize.sm,
      color: themeColors.textTertiary,
    },
    presetQuickActions: {
      marginTop: Spacing.md,
    },
    presetQuickActionsTitle: {
      fontSize: FontSize.sm,
      marginBottom: Spacing.sm,
      color: themeColors.textSecondary,
    },
    presetQuickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    presetQuickChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
    },
    presetQuickChipText: {
      fontSize: FontSize.sm,
      fontWeight: '500',
    },
    viewAllText: {
      fontSize: FontSize.sm,
      fontWeight: '500',
      textAlign: 'center',
      marginTop: Spacing.md,
      color: themeColors.tint,
    },
    presetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    presetIndicator: {
      width: 4,
      height: 40,
      borderRadius: 2,
      marginRight: Spacing.md,
    },
    presetItemInfo: {
      flex: 1,
    },
    presetItemName: {
      fontSize: FontSize.md,
      fontWeight: '600',
      color: themeColors.text,
    },
    presetItemDesc: {
      fontSize: FontSize.sm,
      marginTop: 2,
      color: themeColors.textSecondary,
    },
    presetItemMeta: {
      fontSize: FontSize.xs,
      marginTop: Spacing.xs,
      color: themeColors.textTertiary,
    },
    presetApplyBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      marginLeft: Spacing.md,
    },
    presetApplyText: {
      fontSize: FontSize.sm,
      fontWeight: '500',
    },
    emptyCategoryCard: {
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
      borderWidth: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      alignItems: 'center',
    },
    uncategorizedBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: themeColors.card,
      borderColor: themeColors.border,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.lg,
      marginTop: Spacing.md,
    },
  }), [themeColors]);

  const openCategoryTagManager = (categoryId: number | null) => {
    if (categoryId === null) {
      router.push('/tag/manage/uncategorized' as never);
      return;
    }
    router.push(`/tag/manage/${categoryId}` as never);
  };

  const handleCreatePreset = async (name: string, description: string, color: string) => {
    await presetService.createPreset({ name, description, color });
  };

  const handleUpdatePreset = async (id: number, data: { name?: string; description?: string | null; color?: string; isActive?: boolean }) => {
    await presetService.updatePreset(id, data);
  };

  const handleDeletePreset = async (id: number) => {
    const defaultPreset = await presetService.getDefaultPreset();
    await presetService.deletePreset(id);
    if (defaultPreset && defaultPreset.id === id) {
      await syncDefaultTagIdsFromPreset();
    }
  };

  const handleDuplicatePreset = async (id: number, newName: string) => {
    await presetService.duplicatePreset(id, newName);
  };

  const handleAddTagToPreset = async (presetId: number, tagId: number) => {
    await presetService.addExistingTagToPreset(presetId, tagId);
    const defaultPreset = await presetService.getDefaultPreset();
    if (defaultPreset && defaultPreset.id === presetId) {
      await syncDefaultTagIdsFromPreset();
    }
  };

  const handleRemoveTagFromPreset = async (itemId: number) => {
    const repos = await getRepositories();
    const item = await repos.tagPreset.getItemById(itemId);
    await presetService.removeItemFromPreset(itemId);
    if (item) {
      const defaultPreset = await presetService.getDefaultPreset();
      if (defaultPreset && defaultPreset.id === item.preset_id) {
        await syncDefaultTagIdsFromPreset();
      }
    }
  };

  const handleCreateCategory = async () => {
    const name = categoryName.trim();
    if (!name) return;

    setCreatingCategory(true);
    try {
      const created = await createCategory({
        name,
        color: normalizeHexColor(categoryColor, DEFAULT_COLOR),
      });
      if (!created) return;
      setCategoryName('');
      setCategoryColor(DEFAULT_COLOR);
      await reload();
    } finally {
      setCreatingCategory(false);
    }
  };

  const startEditCategory = (category: TagCategory) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setEditingCategoryColor(normalizeHexColor(category.color, DEFAULT_COLOR));
  };

  const handleSaveCategory = async () => {
    const id = editingCategoryId;
    const name = editingCategoryName.trim();
    if (id == null || !name) return;

    setSavingCategory(true);
    try {
      await updateCategory(id, {
        name,
        color: normalizeHexColor(editingCategoryColor, DEFAULT_COLOR),
      });
      setEditingCategoryId(null);
      setEditingCategoryName('');
      setEditingCategoryColor(DEFAULT_COLOR);
      await reload();
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    setDeletingCategoryId(id);
    try {
      await deleteCategory(id);
      if (editingCategoryId === id) {
        setEditingCategoryId(null);
        setEditingCategoryName('');
        setEditingCategoryColor(DEFAULT_COLOR);
      }
      await reload();
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handleDeleteCategoryPress = (id: number) => {
    if (deletingCategoryId === id) return;

    Alert.alert(
      '删除分类',
      '删除后分类本身会被移除，但该分类下的标签不会被删除，而是转为"未分类"。是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            void handleDeleteCategory(id);
          },
        },
      ]
    );
  };

  const availableTagsForPreset = useMemo(() => {
    return tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }));
  }, [tags]);

  const defaultPreset = useMemo(() => presets.find((p) => p.isDefault) ?? null, [presets]);
  const defaultPresetTagIds = useMemo(() => {
    if (!defaultPreset) return [];
    const items = existingPresetTags.get(defaultPreset.id);
    return items?.map((item) => item.tagId) ?? [];
  }, [defaultPreset, existingPresetTags]);
  const defaultPresetTags = useMemo(
    () => defaultPresetTagIds.map((tagId) => tagMap.get(tagId)).filter(Boolean) as Tag[],
    [defaultPresetTagIds, tagMap]
  );

  const handleSetAsDefault = async (presetId: number) => {
    try {
      await presetService.setDefaultPreset(presetId);
      await loadPresets();
      Alert.alert('设置成功', '已将该预设设为默认标签');
    } catch {
      Alert.alert('设置失败', '无法设置默认预设');
    }
  };

  const handleRemoveDefault = async () => {
    if (!defaultPreset) return;
    try {
      await presetService.removeDefaultPreset(defaultPreset.id);
      await loadPresets();
      Alert.alert('已取消', '默认预设已取消');
    } catch {
      Alert.alert('操作失败', '无法取消默认预设');
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {error ? <Text style={[styles.error, { color: themeColors.error }]}>{error}</Text> : null}

      <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>标签预设</Text>
          <TouchableOpacity onPress={() => setShowPresetManager(true)}>
            <Text style={[styles.cardAction, { color: themeColors.tint }]}>管理预设</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.hintText, { color: themeColors.textSecondary }]}>
          预设是一组标签的组合。设定默认预设后，新导入照片将自动应用该预设中的标签。
        </Text>

        {loadingPresets ? (
          <Text style={[styles.muted, { color: themeColors.textTertiary }]}>加载中...</Text>
        ) : null}

        {!loadingPresets && presets.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>暂无预设</Text>
            <Text style={[styles.emptyHint, { color: themeColors.textTertiary }]}>点击"管理预设"创建第一个预设</Text>
          </View>
        ) : null}

        {defaultPreset ? (
          <View style={[styles.defaultPresetCard, { backgroundColor: hexToRgba(defaultPreset.color, 0.08), borderColor: defaultPreset.color }]}>
            <View style={styles.defaultPresetHeader}>
              <View style={styles.defaultPresetBadge}>
                <Text style={[styles.defaultPresetBadgeText, { color: defaultPreset.color }]}>默认</Text>
              </View>
              <Text style={[styles.defaultPresetName, { color: themeColors.text }]}>{defaultPreset.name}</Text>
              <Text style={[styles.defaultPresetCount, { color: themeColors.textSecondary }]}>
                {defaultPresetTagIds.length} 个标签
              </Text>
            </View>
            {defaultPresetTags.length > 0 && (
              <View style={styles.defaultPresetTags}>
                {defaultPresetTags.slice(0, 5).map((tag) => (
                  <TagBadge key={`default-tag-${tag.id}`} tag={tag} size="small" />
                ))}
                {defaultPresetTags.length > 5 && (
                  <Text style={[styles.defaultPresetMore, { color: themeColors.textTertiary }]}>
                    +{defaultPresetTags.length - 5}
                  </Text>
                )}
              </View>
            )}
            <TouchableOpacity
              style={[styles.removeDefaultBtn, { borderColor: themeColors.border }]}
              onPress={handleRemoveDefault}
            >
              <Text style={[styles.removeDefaultText, { color: themeColors.textSecondary }]}>取消默认</Text>
            </TouchableOpacity>
          </View>
        ) : (
          !loadingPresets && presets.length > 0 && (
            <View style={[styles.noDefaultCard, { backgroundColor: themeColors.surfaceHighlight, borderColor: themeColors.border }]}>
              <Text style={[styles.noDefaultText, { color: themeColors.textSecondary }]}>当前未设置默认预设</Text>
              <Text style={[styles.noDefaultHint, { color: themeColors.textTertiary }]}>选择一个预设设为默认</Text>
            </View>
          )
        )}

        {!loadingPresets && activePresets.length > 0 && (
          <View style={styles.presetQuickActions}>
            <Text style={[styles.presetQuickActionsTitle, { color: themeColors.textSecondary }]}>快速设为默认</Text>
            <View style={styles.presetQuickRow}>
              {activePresets.slice(0, 4).map((preset) => (
                <TouchableOpacity
                  key={`quick-${preset.id}`}
                  style={[
                    styles.presetQuickChip,
                    { backgroundColor: hexToRgba(preset.color, 0.12), borderColor: preset.color },
                    preset.isDefault && { borderWidth: 2 },
                  ]}
                  onPress={() => handleSetAsDefault(preset.id)}
                  disabled={preset.isDefault}
                >
                  <Text style={[styles.presetQuickChipText, { color: preset.color }]}>{preset.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {activePresets.length > 4 && (
          <TouchableOpacity onPress={() => setShowPresetSelector(true)}>
            <Text style={[styles.viewAllText, { color: themeColors.tint }]}>
              查看全部 {activePresets.length} 个预设
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <Text style={[styles.cardTitle, { color: themeColors.text }]}>新建分类</Text>
        <TextInput
          style={[styles.input, { backgroundColor: themeColors.surfaceHighlight, color: themeColors.text, borderColor: themeColors.border }]}
          value={categoryName}
          onChangeText={setCategoryName}
          placeholder="输入分类名称"
          placeholderTextColor={themeColors.textTertiary}
          autoCapitalize="none"
        />
        <TagColorEditor label="分类颜色" value={categoryColor} onChange={setCategoryColor} defaultColor={DEFAULT_COLOR} />
        <Button title="添加分类" onPress={handleCreateCategory} loading={creatingCategory} disabled={!canCreateCategory} />
      </View>

      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>分类管理</Text>
      {categories.length === 0 && uncategorizedCount === 0 ? (
        <View style={[styles.emptyCategoryCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>暂无分类</Text>
          <Text style={[styles.emptyHint, { color: themeColors.textTertiary }]}>使用上方表单创建第一个分类</Text>
        </View>
      ) : null}

      {categories.map((category) => {
        const count = (tagsByCategory.get(category.id) ?? []).length;
        const categoryColor = normalizeHexColor(category.color, DEFAULT_COLOR);
        return (
          <View key={`manage-${category.id}`} style={[styles.manageBlock, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.manageRow}>
              <TouchableOpacity style={styles.rowMain} onPress={() => openCategoryTagManager(category.id)} activeOpacity={0.7}>
                <View style={styles.rowTitleWrap}>
                  <View style={[styles.rowColorDot, { backgroundColor: categoryColor }]} />
                  <Text style={[styles.rowTitle, { color: themeColors.text }]}>{category.name}</Text>
                </View>
                <Text style={[styles.rowMeta, { color: themeColors.textSecondary }]}>
                  {count} 个标签
                </Text>
              </TouchableOpacity>
              <View style={styles.rowActions}>
                <TouchableOpacity onPress={() => openCategoryTagManager(category.id)} activeOpacity={0.7}>
                  <Text style={[styles.actionLink, { color: themeColors.tint }]}>管理</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => startEditCategory(category)} activeOpacity={0.7}>
                  <Text style={[styles.actionLink, { color: themeColors.tint }]}>编辑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteCategoryPress(category.id)}
                  activeOpacity={0.7}
                  disabled={deletingCategoryId === category.id}
                >
                  <Text style={[styles.actionLink, { color: themeColors.error }]}>
                    {deletingCategoryId === category.id ? '删除中...' : '删除'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {editingCategoryId === category.id ? (
              <View style={styles.editorWrap}>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.surfaceHighlight, color: themeColors.text, borderColor: themeColors.border }]}
                  value={editingCategoryName}
                  onChangeText={setEditingCategoryName}
                  placeholder="分类名称"
                  placeholderTextColor={themeColors.textTertiary}
                />
                <TagColorEditor
                  label="分类颜色"
                  value={editingCategoryColor}
                  onChange={setEditingCategoryColor}
                  defaultColor={DEFAULT_COLOR}
                />
                <View style={styles.editorActions}>
                  <Button
                    title="保存"
                    onPress={handleSaveCategory}
                    loading={savingCategory}
                    disabled={!canSaveCategory}
                    style={styles.flexButton}
                  />
                  <View style={styles.gap} />
                  <Button
                    title="取消"
                    onPress={() => {
                      setEditingCategoryId(null);
                      setEditingCategoryName('');
                      setEditingCategoryColor(DEFAULT_COLOR);
                    }}
                    variant="outline"
                    style={styles.flexButton}
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.uncategorizedBlock, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => openCategoryTagManager(null)}
        activeOpacity={0.7}
      >
        <View style={styles.rowMain}>
          <View style={styles.rowTitleWrap}>
            <View style={[styles.rowColorDot, { backgroundColor: '#9ca3af' }]} />
            <Text style={[styles.rowTitle, { color: themeColors.text }]}>未分类</Text>
          </View>
          <Text style={[styles.rowMeta, { color: themeColors.textSecondary }]}>{uncategorizedCount} 个标签</Text>
        </View>
        <Text style={[styles.actionText, { color: themeColors.tint }]}>管理</Text>
      </TouchableOpacity>

      {loading ? <Text style={[styles.muted, { color: themeColors.textTertiary }]}>加载中...</Text> : null}

      <PresetManager
        visible={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        presets={presets.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          color: p.color,
          itemCount: p.itemCount,
          isActive: p.isActive,
        }))}
        onRefresh={loadPresets}
        onCreatePreset={handleCreatePreset}
        onUpdatePreset={handleUpdatePreset}
        onDeletePreset={handleDeletePreset}
        onDuplicatePreset={handleDuplicatePreset}
        onAddTagToPreset={handleAddTagToPreset}
        onRemoveTagFromPreset={handleRemoveTagFromPreset}
        availableTags={availableTagsForPreset}
        existingPresetTags={existingPresetTags}
      />

      <Modal visible={showPresetSelector} animationType="none" onRequestClose={() => setShowPresetSelector(false)}>
        <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity onPress={() => setShowPresetSelector(false)}>
              <Text style={[styles.modalClose, { color: themeColors.tint }]}>关闭</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>选择预设</Text>
            <View style={{ width: 50 }} />
          </View>

          <FlatList
            data={presets}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.presetList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>暂无预设</Text>
                <Text style={[styles.emptyHint, { color: themeColors.textTertiary }]}>点击上方"管理预设"创建</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.presetItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                onPress={() => handleSetAsDefault(item.id)}
              >
                <View style={[styles.presetIndicator, { backgroundColor: item.color }]} />
                <View style={styles.presetItemInfo}>
                  <Text style={[styles.presetItemName, { color: themeColors.text }]}>{item.name}</Text>
                  {item.description ? (
                    <Text style={[styles.presetItemDesc, { color: themeColors.textSecondary }]}>{item.description}</Text>
                  ) : null}
                  <Text style={[styles.presetItemMeta, { color: themeColors.textTertiary }]}>
                    {item.itemCount} 个标签 · {item.isDefault ? '默认' : item.isActive ? '已启用' : '已停用'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.presetApplyBtn, { backgroundColor: hexToRgba(item.color, 0.15) }]}
                  onPress={() => handleSetAsDefault(item.id)}
                  disabled={item.isDefault}
                >
                  <Text style={[styles.presetApplyText, { color: item.color }]}>
                    {item.isDefault ? '当前默认' : '设为默认'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

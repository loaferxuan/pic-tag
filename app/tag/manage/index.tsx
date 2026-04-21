import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useTagsWithCategories } from '@/features/tag/hooks/useTags';
import { useTagStore } from '@/features/tag/store/tag.store';
import { TagCategorySection } from '@/features/tag/components/TagCategorySection';
import { TagBadge } from '@/features/tag/components/TagBadge';
import { TagColorEditor, isColorDraftValid } from '@/features/tag/components/TagColorEditor';
import { Button } from '@/shared/ui/Button';
import type { Tag, TagCategory } from '@/shared/types/domain';
import { normalizeHexColor } from '@/shared/utils/color';
import { getSanitizedDefaultTagIds, saveDefaultTagIds } from '@/features/tag/services/default-tag.service';

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

  const [defaultTagIds, setDefaultTagIds] = useState<number[]>([]);
  const [loadingDefaultTags, setLoadingDefaultTags] = useState(false);
  const [savingDefaultTags, setSavingDefaultTags] = useState(false);

  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const defaultSelectedTags = useMemo(
    () => defaultTagIds.map((tagId) => tagMap.get(tagId)).filter(Boolean) as Tag[],
    [defaultTagIds, tagMap]
  );
  const canCreateCategory = categoryName.trim().length > 0 && isColorDraftValid(categoryColor);
  const canSaveCategory = editingCategoryName.trim().length > 0 && isColorDraftValid(editingCategoryColor);
  const uncategorizedCount = tagsByCategory.get(-1)?.length ?? 0;

  useEffect(() => {
    let mounted = true;
    const loadDefaultTags = async () => {
      setLoadingDefaultTags(true);
      try {
        const sanitized = await getSanitizedDefaultTagIds();
        if (mounted) setDefaultTagIds(sanitized);
      } finally {
        if (mounted) setLoadingDefaultTags(false);
      }
    };
    void loadDefaultTags();
    return () => {
      mounted = false;
    };
  }, [tags]);

  const openCategoryTagManager = (categoryId: number | null) => {
    if (categoryId === null) {
      router.push('/tag/manage/uncategorized' as never);
      return;
    }
    router.push(`/tag/manage/${categoryId}` as never);
  };

  const toggleDefaultTag = (tagId: number) => {
    setDefaultTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  };

  const handleSaveDefaultTags = async () => {
    setSavingDefaultTags(true);
    try {
      const saved = await saveDefaultTagIds(defaultTagIds);
      setDefaultTagIds(saved);
    } finally {
      setSavingDefaultTags(false);
    }
  };

  const handleClearDefaultTags = async () => {
    setSavingDefaultTags(true);
    try {
      await saveDefaultTagIds([]);
      setDefaultTagIds([]);
    } finally {
      setSavingDefaultTags(false);
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
      '\u5220\u9664\u5206\u7c7b',
      '\u5220\u9664\u540e\u5206\u7c7b\u672c\u8eab\u4f1a\u88ab\u79fb\u9664\uff0c\u4f46\u8be5\u5206\u7c7b\u4e0b\u7684\u6807\u7b7e\u4e0d\u4f1a\u88ab\u5220\u9664\uff0c\u800c\u662f\u8f6c\u4e3a\u201c\u672a\u5206\u7c7b\u201d\u3002\u662f\u5426\u7ee7\u7eed\uff1f',
      [
        { text: '\u53d6\u6d88', style: 'cancel' },
        {
          text: '\u5220\u9664',
          style: 'destructive',
          onPress: () => {
            void handleDeleteCategory(id);
          },
        },
      ]
    );
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>默认标签</Text>
        <Text style={styles.hintText}>
          仅对新导入照片生效：首次进入照片详情且当前无标签时，按当时最新默认标签配置自动补打一轮。
        </Text>
        <Text style={styles.hintText}>若后续手动清空照片标签，不会再次自动补打。</Text>

        {loadingDefaultTags ? <Text style={styles.muted}>默认标签加载中...</Text> : null}

        {!loadingDefaultTags && defaultSelectedTags.length === 0 ? (
          <Text style={styles.muted}>当前未设置默认标签。</Text>
        ) : null}

        {defaultSelectedTags.length > 0 ? (
          <View style={styles.selectedTagRow}>
            {defaultSelectedTags.map((tag) => (
              <TagBadge key={`default-selected-${tag.id}`} tag={tag} selected size="small" />
            ))}
          </View>
        ) : null}

        {tags.length === 0 ? (
          <Text style={styles.muted}>暂无可选标签，请先创建分类并进入分类创建标签。</Text>
        ) : (
          <>
            {categories.map((cat) => (
              <TagCategorySection
                key={`default-category-${cat.id}`}
                category={cat}
                tags={(tagsByCategory.get(cat.id) ?? []) as Tag[]}
                selectedTagIds={defaultTagIds}
                onTagPress={toggleDefaultTag}
              />
            ))}

            {uncategorizedCount > 0 ? (
              <TagCategorySection
                category={UNCATEGORIZED_CATEGORY}
                tags={(tagsByCategory.get(-1) ?? []) as Tag[]}
                selectedTagIds={defaultTagIds}
                onTagPress={toggleDefaultTag}
              />
            ) : null}
          </>
        )}

        <View style={styles.editorActions}>
          <Button title="保存默认标签" onPress={handleSaveDefaultTags} loading={savingDefaultTags} style={styles.flexButton} />
          <View style={styles.gap} />
          <Button
            title="清空默认标签"
            onPress={handleClearDefaultTags}
            variant="outline"
            style={styles.flexButton}
            disabled={savingDefaultTags || defaultTagIds.length === 0}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>新建分类</Text>
        <TextInput
          style={styles.input}
          value={categoryName}
          onChangeText={setCategoryName}
          placeholder="输入分类名称"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />
        <TagColorEditor label="分类颜色" value={categoryColor} onChange={setCategoryColor} defaultColor={DEFAULT_COLOR} />
        <Button title="添加分类" onPress={handleCreateCategory} loading={creatingCategory} disabled={!canCreateCategory} />
      </View>

      <Text style={styles.sectionTitle}>按分类管理标签</Text>
      {categories.length === 0 && uncategorizedCount === 0 ? <Text style={styles.muted}>暂无可管理标签</Text> : null}

      {categories.map((category) => {
        const count = (tagsByCategory.get(category.id) ?? []).length;
        const categoryColor = normalizeHexColor(category.color, DEFAULT_COLOR);
        return (
          <TouchableOpacity
            key={`entry-${category.id}`}
            style={styles.entryBlock}
            onPress={() => openCategoryTagManager(category.id)}
            activeOpacity={0.7}
          >
            <View style={styles.rowMain}>
              <View style={styles.rowTitleWrap}>
                <View style={[styles.rowColorDot, { backgroundColor: categoryColor }]} />
                <Text style={styles.rowTitle}>{category.name}</Text>
              </View>
              <Text style={styles.rowMeta}>{count} 个标签</Text>
            </View>
            <Text style={styles.actionText}>进入</Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity style={styles.entryBlock} onPress={() => openCategoryTagManager(null)} activeOpacity={0.7}>
        <View style={styles.rowMain}>
          <View style={styles.rowTitleWrap}>
            <View style={[styles.rowColorDot, { backgroundColor: '#9ca3af' }]} />
            <Text style={styles.rowTitle}>未分类</Text>
          </View>
          <Text style={styles.rowMeta}>{uncategorizedCount} 个标签</Text>
        </View>
        <Text style={styles.actionText}>进入</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>分类管理</Text>
      {categories.length === 0 ? <Text style={styles.muted}>暂无分类</Text> : null}

      {categories.map((category) => {
        const count = (tagsByCategory.get(category.id) ?? []).length;
        const categoryColor = normalizeHexColor(category.color, DEFAULT_COLOR);
        return (
          <View key={`manage-${category.id}`} style={styles.manageBlock}>
            <View style={styles.manageRow}>
              <View style={styles.rowMain}>
                <View style={styles.rowTitleWrap}>
                  <View style={[styles.rowColorDot, { backgroundColor: categoryColor }]} />
                  <Text style={styles.rowTitle}>{category.name}</Text>
                </View>
                <Text style={styles.rowMeta}>
                  {count} 个标签 · {categoryColor}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity onPress={() => openCategoryTagManager(category.id)} activeOpacity={0.7}>
                  <Text style={styles.actionText}>管理标签</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => startEditCategory(category)} activeOpacity={0.7}>
                  <Text style={styles.actionText}>编辑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteCategoryPress(category.id)}
                  activeOpacity={0.7}
                  disabled={deletingCategoryId === category.id}
                >
                  <Text style={[styles.actionText, styles.deleteText]}>
                    {deletingCategoryId === category.id ? '删除中...' : '删除'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {editingCategoryId === category.id ? (
              <View style={styles.editorWrap}>
                <TextInput
                  style={styles.input}
                  value={editingCategoryName}
                  onChangeText={setEditingCategoryName}
                  placeholder="分类名称"
                  placeholderTextColor="#9ca3af"
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

      {loading ? <Text style={styles.muted}>加载中...</Text> : null}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  hintText: {
    color: '#475569',
    fontSize: 13,
    marginBottom: 6,
  },
  selectedTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
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
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
  },
  entryBlock: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  manageBlock: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
  },
  rowTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  deleteText: {
    color: '#dc2626',
  },
  editorWrap: {
    marginTop: 10,
  },
  editorActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flexButton: {
    flex: 1,
  },
  gap: {
    width: 10,
  },
  error: { color: '#dc2626', marginBottom: 12 },
  muted: { color: '#6b7280', fontSize: 14, marginBottom: 8 },
});


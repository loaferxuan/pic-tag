import React, { useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTagsWithCategories } from '@/features/tag/hooks/useTags';
import { useTagStore } from '@/features/tag/store/tag.store';
import { TagColorEditor, isColorDraftValid } from '@/features/tag/components/TagColorEditor';
import { Button } from '@/shared/ui/Button';
import type { Tag } from '@/shared/types/domain';
import { normalizeHexColor } from '@/shared/utils/color';

const DEFAULT_COLOR = '#808080';

function parseCategoryKey(categoryKey: string | null): number | null | undefined {
  if (!categoryKey) return undefined;
  if (categoryKey === 'uncategorized') return null;
  if (!/^\d+$/.test(categoryKey)) return undefined;
  return Number.parseInt(categoryKey, 10);
}

export default function CategoryTagManageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryKey?: string | string[] }>();
  const { categories, tagsByCategory, loading, error, reload } = useTagsWithCategories();
  const createTag = useTagStore((s) => s.createTag);
  const updateTag = useTagStore((s) => s.updateTag);
  const deleteTag = useTagStore((s) => s.deleteTag);

  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(DEFAULT_COLOR);
  const [creatingTag, setCreatingTag] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<number | null>(null);

  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingTagCategoryId, setEditingTagCategoryId] = useState<number | null>(null);
  const [editingTagColor, setEditingTagColor] = useState(DEFAULT_COLOR);
  const [savingTag, setSavingTag] = useState(false);

  const categoryKey = useMemo(() => {
    const raw = params.categoryKey;
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw ?? null;
  }, [params.categoryKey]);

  const targetCategoryId = useMemo(() => parseCategoryKey(categoryKey), [categoryKey]);
  const invalidCategoryKey = targetCategoryId === undefined;
  const targetCategory = useMemo(
    () => (targetCategoryId == null || targetCategoryId === undefined ? null : categories.find((c) => c.id === targetCategoryId) ?? null),
    [categories, targetCategoryId]
  );
  const categoryNotFound = targetCategoryId !== undefined && targetCategoryId !== null && !loading && !targetCategory;

  const screenTitle = useMemo(() => {
    if (targetCategoryId === null) return '未分类标签';
    if (targetCategory) return targetCategory.name;
    return '标签管理';
  }, [targetCategory, targetCategoryId]);

  const targetCategoryLabel = useMemo(() => {
    if (targetCategoryId === null) return '未分类';
    if (targetCategory) return targetCategory.name;
    return '标签管理';
  }, [targetCategory, targetCategoryId]);

  const categoryOptions = useMemo(
    () => [{ id: null as number | null, name: '未分类' }, ...categories.map((c) => ({ id: c.id, name: c.name }))],
    [categories]
  );

  const categoryNameMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const targetTags = useMemo(() => {
    if (targetCategoryId === undefined) return [];
    if (targetCategoryId === null) return (tagsByCategory.get(-1) ?? []) as Tag[];
    return (tagsByCategory.get(targetCategoryId) ?? []) as Tag[];
  }, [tagsByCategory, targetCategoryId]);

  const canCreateTag = tagName.trim().length > 0 && isColorDraftValid(tagColor);
  const canSaveTag = editingTagName.trim().length > 0 && isColorDraftValid(editingTagColor);

  const handleCreateTag = async () => {
    if (targetCategoryId === undefined) return;
    const name = tagName.trim();
    if (!name) return;

    setCreatingTag(true);
    try {
      const created = await createTag({
        name,
        color: normalizeHexColor(tagColor, DEFAULT_COLOR),
        categoryId: targetCategoryId,
      });
      if (!created) return;
      setTagName('');
      setTagColor(DEFAULT_COLOR);
      await reload();
    } finally {
      setCreatingTag(false);
    }
  };

  const startEditTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setEditingTagCategoryId(tag.categoryId ?? null);
    setEditingTagColor(normalizeHexColor(tag.color, DEFAULT_COLOR));
  };

  const handleSaveTag = async () => {
    const id = editingTagId;
    const name = editingTagName.trim();
    if (id == null || !name) return;

    setSavingTag(true);
    try {
      await updateTag(id, {
        name,
        color: normalizeHexColor(editingTagColor, DEFAULT_COLOR),
        categoryId: editingTagCategoryId,
      });
      setEditingTagId(null);
      setEditingTagName('');
      setEditingTagCategoryId(null);
      setEditingTagColor(DEFAULT_COLOR);
      await reload();
    } finally {
      setSavingTag(false);
    }
  };

  const handleDeleteTag = async (id: number) => {
    setDeletingTagId(id);
    try {
      await deleteTag(id);
      if (editingTagId === id) {
        setEditingTagId(null);
        setEditingTagName('');
        setEditingTagCategoryId(null);
        setEditingTagColor(DEFAULT_COLOR);
      }
      await reload();
    } finally {
      setDeletingTagId(null);
    }
  };

  const handleDeleteTagPress = (id: number) => {
    if (deletingTagId === id) return;

    Alert.alert(
      '\u5220\u9664\u6807\u7b7e',
      '\u5220\u9664\u540e\u8be5\u6807\u7b7e\u53ca\u5176\u7167\u7247\u5173\u8054\u4f1a\u88ab\u79fb\u9664\uff0c\u65e0\u6cd5\u6062\u590d\u3002\u662f\u5426\u7ee7\u7eed\uff1f',
      [
        { text: '\u53d6\u6d88', style: 'cancel' },
        {
          text: '\u5220\u9664',
          style: 'destructive',
          onPress: () => {
            void handleDeleteTag(id);
          },
        },
      ]
    );
  };

  if (invalidCategoryKey) {
    return (
      <>
        <Stack.Screen options={{ title: '标签管理' }} />
        <View style={styles.center}>
          <Text style={styles.error}>分类参数无效</Text>
          <Button title="返回" onPress={() => router.back()} variant="outline" />
        </View>
      </>
    );
  }

  if (categoryNotFound) {
    return (
      <>
        <Stack.Screen options={{ title: '标签管理' }} />
        <View style={styles.center}>
          <Text style={styles.error}>分类不存在或已删除</Text>
          <Button title="返回" onPress={() => router.back()} variant="outline" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: screenTitle }} />
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={12}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>新建标签</Text>
          <Text style={styles.hintText}>将创建到：{targetCategoryLabel}</Text>
          <TextInput
            style={styles.input}
            value={tagName}
            onChangeText={setTagName}
            placeholder="输入标签名称"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />
          <TagColorEditor label="标签颜色" value={tagColor} onChange={setTagColor} defaultColor={DEFAULT_COLOR} />
          <Button title="添加标签" onPress={handleCreateTag} loading={creatingTag} disabled={!canCreateTag} />
        </View>

        <Text style={styles.sectionTitle}>标签管理</Text>
        {loading ? <Text style={styles.muted}>加载中...</Text> : null}
        {!loading && targetTags.length === 0 ? <Text style={styles.muted}>当前分类暂无标签</Text> : null}

        {targetTags.map((tag) => {
          const currentCategoryName = tag.categoryId == null ? '未分类' : categoryNameMap.get(tag.categoryId) ?? '未分类';
          const tagColorHex = normalizeHexColor(tag.color, DEFAULT_COLOR);
          return (
            <View key={tag.id} style={styles.manageBlock}>
              <View style={styles.manageRow}>
                <View style={styles.rowMain}>
                  <View style={styles.rowTitleWrap}>
                    <View style={[styles.rowColorDot, { backgroundColor: tagColorHex }]} />
                    <Text style={styles.rowTitle}>{tag.name}</Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {currentCategoryName} · {tagColorHex}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => startEditTag(tag)} activeOpacity={0.7}>
                    <Text style={styles.actionText}>编辑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteTagPress(tag.id)}
                    activeOpacity={0.7}
                    disabled={deletingTagId === tag.id}
                  >
                    <Text style={[styles.actionText, styles.deleteText]}>
                      {deletingTagId === tag.id ? '删除中...' : '删除'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {editingTagId === tag.id ? (
                <View style={styles.editorWrap}>
                  <TextInput
                    style={styles.input}
                    value={editingTagName}
                    onChangeText={setEditingTagName}
                    placeholder="标签名称"
                    placeholderTextColor="#9ca3af"
                  />
                  <TagColorEditor
                    label="标签颜色"
                    value={editingTagColor}
                    onChange={setEditingTagColor}
                    defaultColor={DEFAULT_COLOR}
                  />
                  <Text style={styles.label}>所属分类</Text>
                  <View style={styles.selectorWrap}>
                    {categoryOptions.map((option) => {
                      const selected = editingTagCategoryId === option.id;
                      return (
                        <TouchableOpacity
                          key={option.id ?? -1}
                          style={[styles.selectorChip, selected && styles.selectorChipSelected]}
                          onPress={() => setEditingTagCategoryId(option.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.selectorText, selected && styles.selectorTextSelected]}>{option.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.editorActions}>
                    <Button
                      title="保存"
                      onPress={handleSaveTag}
                      loading={savingTag}
                      disabled={!canSaveTag}
                      style={styles.flexButton}
                    />
                    <View style={styles.gap} />
                    <Button
                      title="取消"
                      onPress={() => {
                        setEditingTagId(null);
                        setEditingTagName('');
                        setEditingTagCategoryId(null);
                        setEditingTagColor(DEFAULT_COLOR);
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
      </KeyboardAwareScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9fafb',
  },
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
    marginBottom: 8,
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
  label: {
    color: '#374151',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '500',
  },
  selectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  selectorChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  selectorChipSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  selectorText: {
    color: '#334155',
    fontSize: 12,
  },
  selectorTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
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


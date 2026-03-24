import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import Colors from '@/shared/theme/Colors';
import { PRESET_COLORS } from '@/features/tag/services/tag-preset.service';
import { hexToRgba } from '@/shared/utils/color';
import { BorderRadius, Spacing, FontSize, Shadow } from '@/shared/theme/Theme';

interface PresetItem {
  id: number;
  name: string;
  description: string | null;
  color: string;
  itemCount: number;
  isActive: boolean;
}

interface PresetManagerProps {
  visible: boolean;
  onClose: () => void;
  presets: PresetItem[];
  onRefresh: () => void;
  onCreatePreset: (name: string, description: string, color: string) => Promise<void>;
  onUpdatePreset: (id: number, data: { name?: string; description?: string | null; color?: string; isActive?: boolean }) => Promise<void>;
  onDeletePreset: (id: number) => Promise<void>;
  onDuplicatePreset: (id: number, newName: string) => Promise<void>;
  onAddTagToPreset: (presetId: number, tagId: number) => Promise<void>;
  onRemoveTagFromPreset: (itemId: number) => Promise<void>;
  availableTags: Array<{ id: number; name: string; color: string }>;
  existingPresetTags: Map<number, Array<{ itemId: number; tagId: number; name: string; color: string }>>;
}

export const PresetManager = memo(function PresetManager({
  visible,
  onClose,
  presets,
  onRefresh,
  onCreatePreset,
  onUpdatePreset,
  onDeletePreset,
  onDuplicatePreset,
  onAddTagToPreset,
  onRemoveTagFromPreset,
  availableTags,
  existingPresetTags,
}: PresetManagerProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [newPresetColor, setNewPresetColor] = useState(PRESET_COLORS[0]);
  const [creatingPreset, setCreatingPreset] = useState(false);

  const [editingPresetId, setEditingPresetId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const [addingTagToPreset, setAddingTagToPreset] = useState<number | null>(null);

  const handleCreatePreset = useCallback(async () => {
    if (!newPresetName.trim() || creatingPreset) return;
    setCreatingPreset(true);
    try {
      await onCreatePreset(newPresetName.trim(), newPresetDesc.trim(), newPresetColor);
      setNewPresetName('');
      setNewPresetDesc('');
      setNewPresetColor(PRESET_COLORS[0]);
      setShowCreateForm(false);
      onRefresh();
    } finally {
      setCreatingPreset(false);
    }
  }, [newPresetName, newPresetDesc, newPresetColor, onCreatePreset, onRefresh, creatingPreset]);

  const handleTogglePreset = useCallback(
    async (preset: PresetItem) => {
      await onUpdatePreset(preset.id, { isActive: !preset.isActive });
      onRefresh();
    },
    [onUpdatePreset, onRefresh]
  );

  const handleDeletePreset = useCallback(
    async (preset: PresetItem) => {
      Alert.alert('确认删除', `确定要删除预设 "${preset.name}" 吗？`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            await onDeletePreset(preset.id);
            onRefresh();
          },
        },
      ]);
    },
    [onDeletePreset, onRefresh]
  );

  const handleDuplicatePreset = useCallback(
    async (preset: PresetItem) => {
      Alert.prompt(
        '复制预设',
        '请输入新预设名称',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '复制',
            onPress: async (newName?: string) => {
              if (!newName?.trim()) return;
              await onDuplicatePreset(preset.id, newName.trim());
              onRefresh();
            },
          },
        ],
        'plain-text',
        `${preset.name} (副本)`
      );
    },
    [onDuplicatePreset, onRefresh]
  );

  const handleStartEdit = useCallback((preset: PresetItem) => {
    setEditingPresetId(preset.id);
    setEditName(preset.name);
    setEditDesc(preset.description ?? '');
  }, []);

  const handleSaveEdit = useCallback(
    async () => {
      if (!editingPresetId || !editName.trim()) return;
      await onUpdatePreset(editingPresetId, {
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      setEditingPresetId(null);
      setEditName('');
      setEditDesc('');
      onRefresh();
    },
    [editingPresetId, editName, editDesc, onUpdatePreset, onRefresh]
  );

  const handleAddTag = useCallback(
    async (presetId: number, tagId: number) => {
      await onAddTagToPreset(presetId, tagId);
      onRefresh();
    },
    [onAddTagToPreset, onRefresh]
  );

  const handleRemoveTag = useCallback(
    async (itemId: number) => {
      await onRemoveTagFromPreset(itemId);
      onRefresh();
    },
    [onRemoveTagFromPreset, onRefresh]
  );

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.headerButtonText, { color: themeColors.tint }]}>关闭</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>管理预设</Text>
          <TouchableOpacity 
            onPress={() => setShowCreateForm(true)} 
            style={styles.createButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={[styles.createButtonInner, { backgroundColor: themeColors.tint }]}>
              <Text style={styles.createButtonText}>+</Text>
              <Text style={[styles.createButtonLabel, { color: '#ffffff' }]}>新建</Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {presets.length === 0 && !showCreateForm ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: hexToRgba(themeColors.tint, 0.1) }]}>
                <Text style={[styles.emptyIconText, { color: themeColors.tint }]}>📁</Text>
              </View>
              <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>暂无预设</Text>
              <Text style={[styles.emptyHint, { color: themeColors.textTertiary }]}>点击右上角新建预设</Text>
            </View>
          ) : null}

          {showCreateForm && (
            <View style={[styles.createForm, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.formTitle, { color: themeColors.text }]}>新建预设</Text>
              <TextInput
                style={[styles.input, { backgroundColor: themeColors.surfaceHighlight, color: themeColors.text, borderColor: themeColors.border }]}
                value={newPresetName}
                onChangeText={setNewPresetName}
                placeholder="输入预设名称"
                placeholderTextColor={themeColors.textTertiary}
              />
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: themeColors.surfaceHighlight, color: themeColors.text, borderColor: themeColors.border }]}
                value={newPresetDesc}
                onChangeText={setNewPresetDesc}
                placeholder="描述（可选）"
                placeholderTextColor={themeColors.textTertiary}
                multiline
              />
              <View style={styles.colorRow}>
                {PRESET_COLORS.slice(0, 6).map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorDot,
                      { backgroundColor: color },
                      newPresetColor === color && { borderColor: '#fff', borderWidth: 3 },
                    ]}
                    onPress={() => setNewPresetColor(color)}
                  />
                ))}
              </View>
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.formBtn, { backgroundColor: themeColors.surfaceHighlight }]}
                  onPress={() => {
                    if (!creatingPreset) {
                      setShowCreateForm(false);
                      setNewPresetName('');
                      setNewPresetDesc('');
                      setNewPresetColor(PRESET_COLORS[0]);
                    }
                  }}
                  disabled={creatingPreset}
                >
                  <Text style={[styles.formBtnText, { color: themeColors.textSecondary }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formBtn, { backgroundColor: newPresetColor }, (!newPresetName.trim() || creatingPreset) && styles.formBtnDisabled]}
                  onPress={handleCreatePreset}
                  disabled={!newPresetName.trim() || creatingPreset}
                >
                  <Text style={[styles.formBtnText, { color: '#fff' }]}>{creatingPreset ? '创建中...' : '创建'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {presets.map((preset) => (
            <View key={preset.id} style={[styles.presetCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              {editingPresetId === preset.id ? (
                <View>
                  <TextInput
                    style={[styles.input, { backgroundColor: themeColors.surfaceHighlight, color: themeColors.text, borderColor: themeColors.border }]}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="预设名称"
                    placeholderTextColor={themeColors.textTertiary}
                  />
                  <TextInput
                    style={[styles.input, styles.textArea, { backgroundColor: themeColors.surfaceHighlight, color: themeColors.text, borderColor: themeColors.border }]}
                    value={editDesc}
                    onChangeText={setEditDesc}
                    placeholder="描述（可选）"
                    placeholderTextColor={themeColors.textTertiary}
                    multiline
                  />
                  <View style={styles.formActions}>
                    <TouchableOpacity style={[styles.formBtn, { backgroundColor: themeColors.surfaceHighlight }]} onPress={() => setEditingPresetId(null)}>
                      <Text style={[styles.formBtnText, { color: themeColors.textSecondary }]}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.formBtn, { backgroundColor: preset.color }]} onPress={handleSaveEdit}>
                      <Text style={[styles.formBtnText, { color: '#fff' }]}>保存</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.presetHeader}>
                    <View style={[styles.presetIndicator, { backgroundColor: preset.color }]} />
                    <View style={styles.presetInfo}>
                      <Text style={[styles.presetName, { color: themeColors.text }]}>{preset.name}</Text>
                      {preset.description ? (
                        <Text style={[styles.presetDesc, { color: themeColors.textSecondary }]}>{preset.description}</Text>
                      ) : null}
                      <View style={styles.statusBadge}>
                        <Text style={[styles.presetMeta, { color: themeColors.textTertiary }]}>
                          {preset.itemCount} 个标签
                        </Text>
                        <View style={[styles.statusDot, { backgroundColor: preset.isActive ? themeColors.success : themeColors.disabled }]} />
                        <Text style={[styles.statusText, { color: preset.isActive ? themeColors.success : themeColors.textTertiary }]}>
                          {preset.isActive ? '已启用' : '已停用'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.tagList}>
                    {(existingPresetTags.get(preset.id) ?? []).map((item) => (
                      <View key={item.itemId} style={[styles.tagChip, { backgroundColor: hexToRgba(item.color, 0.12) }]}>
                        <View style={[styles.tagChipDot, { backgroundColor: item.color }]} />
                        <Text style={[styles.tagChipText, { color: themeColors.text }]}>{item.name}</Text>
                        <TouchableOpacity onPress={() => handleRemoveTag(item.itemId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={[styles.tagChipRemove, { color: themeColors.textTertiary }]}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[styles.addTagBtn, { borderColor: hexToRgba(preset.color, 0.5) }]}
                      onPress={() => setAddingTagToPreset(preset.id)}
                    >
                      <Text style={[styles.addTagBtnText, { color: preset.color }]}>+ 添加标签</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.presetActions, { borderTopColor: themeColors.borderLight }]}>
                    <TouchableOpacity onPress={() => handleStartEdit(preset)} style={styles.actionBtn}>
                      <Text style={[styles.actionLink, { color: themeColors.tint }]}>编辑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleTogglePreset(preset)} style={styles.actionBtn}>
                      <Text style={[styles.actionLink, { color: preset.isActive ? themeColors.warning : themeColors.success }]}>
                        {preset.isActive ? '停用' : '启用'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDuplicatePreset(preset)} style={styles.actionBtn}>
                      <Text style={[styles.actionLink, { color: themeColors.tint }]}>复制</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeletePreset(preset)} style={styles.actionBtn}>
                      <Text style={[styles.actionLink, { color: themeColors.error }]}>删除</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}
        </ScrollView>

        <Modal visible={addingTagToPreset !== null} transparent animationType="none" onRequestClose={() => setAddingTagToPreset(null)}>
          <View style={[styles.modalOverlay, { backgroundColor: themeColors.overlay }]}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>添加标签到预设</Text>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {availableTags.length === 0 ? (
                  <View style={styles.emptyModalState}>
                    <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>暂无可添加的标签</Text>
                    <Text style={[styles.emptyHint, { color: themeColors.textTertiary }]}>请先在标签管理中创建标签</Text>
                  </View>
                ) : (
                  availableTags.map((tag) => (
                    <TouchableOpacity
                      key={tag.id}
                      style={[styles.tagOption, { borderBottomColor: themeColors.borderLight }]}
                      onPress={async () => {
                        if (addingTagToPreset !== null) {
                          await handleAddTag(addingTagToPreset, tag.id);
                          setAddingTagToPreset(null);
                        }
                      }}
                    >
                      <View style={[styles.tagOptionDot, { backgroundColor: tag.color }]} />
                      <Text style={[styles.tagOptionText, { color: themeColors.text }]}>{tag.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: themeColors.surfaceHighlight }]} onPress={() => setAddingTagToPreset(null)}>
                <Text style={[styles.modalCloseText, { color: themeColors.textSecondary }]}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  createButton: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 64,
    minHeight: 36,
  },
  createButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: '#ffffff',
    marginRight: 4,
  },
  createButtonLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyIconText: {
    fontSize: 28,
  },
  emptyText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  emptyHint: {
    fontSize: FontSize.sm,
  },
  createForm: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  formTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  input: {
    height: 48,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  textArea: {
    height: 72,
    textAlignVertical: 'top',
    paddingTop: Spacing.md,
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
  },
  formBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  formBtnDisabled: {
    opacity: 0.5,
  },
  formBtnText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  presetCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  presetHeader: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  presetIndicator: {
    width: 4,
    borderRadius: 2,
    marginRight: Spacing.md,
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  presetDesc: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: 6,
  },
  presetMeta: {
    fontSize: FontSize.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  tagChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tagChipText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  tagChipRemove: {
    fontSize: 18,
    fontWeight: '300',
    marginLeft: 2,
  },
  addTagBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addTagBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  presetActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.xs,
  },
  actionBtn: {
    paddingRight: Spacing.md,
  },
  actionLink: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxHeight: '65%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  modalScroll: {
    maxHeight: 280,
  },
  emptyModalState: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  tagOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  tagOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.md,
  },
  tagOptionText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  modalCloseBtn: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
});

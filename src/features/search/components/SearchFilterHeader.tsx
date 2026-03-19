import React, { memo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { TagBadge } from '@/features/tag/components/TagBadge';
import { TagCategorySection } from '@/features/tag/components/TagCategorySection';
import { UNCATEGORIZED_TAG_CATEGORY_ID } from '@/shared/constants';
import type { Tag, TagCategory } from '@/shared/types/domain';
import { Button } from '@/shared/ui/Button';
import Colors from '@/shared/theme/Colors';

type ThemeColors = typeof Colors.light;

interface CategoryGroup {
  category: TagCategory;
  tags: Tag[];
}

export type SearchFilterPanelKey = 'tagMatchMode' | 'tagStatus' | 'missingCategory';

interface SearchFilterHeaderProps {
  colors: ThemeColors;
  tagMatchMode: 'AND' | 'OR';
  onTagMatchModeChange: (mode: 'AND' | 'OR') => void;
  onlyUntagged: boolean;
  onOnlyUntaggedChange: (value: boolean) => void;
  missingCategoryId: number | null;
  missingCategoryOptions: TagCategory[];
  onMissingCategoryPress: (categoryId: number | null) => void;
  hasUnresolvedAssociation: boolean;
  onlyUnresolvedAssociation: boolean;
  onOnlyUnresolvedAssociationChange: (value: boolean) => void;
  fromLabel: string;
  toLabel: string;
  activeDateField: 'from' | 'to' | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  onOpenDatePicker: (field: 'from' | 'to') => void;
  onDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onClearDateRange: () => void;
  onReset: () => void;
  onSearch: () => void;
  loading: boolean;
  totalCount: number;
  loadedCount: number;
  error: string | null;
  selectedTagIds: number[];
  selectedTags: Tag[];
  onRemoveTag: (tagId: number) => void;
  tagsError: string | null;
  tagsLoading: boolean;
  tags: Tag[];
  categoryGroups: CategoryGroup[];
  uncategorizedTags: Tag[];
  onToggleTag: (tagId: number) => void;
  tagSelectionDisabled: boolean;
  tagSelectionDisabledHint: string | null;
  collapsedFilterPanels: Record<SearchFilterPanelKey, boolean>;
  onToggleFilterPanelCollapsed: (panel: SearchFilterPanelKey) => void;
  collapsedCategories: Partial<Record<number, boolean>>;
  onToggleCategoryCollapsed: (categoryId: number) => void;
}

interface CollapsibleFilterPanelProps {
  colors: ThemeColors;
  title: string;
  summary: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function CollapsibleFilterPanel({
  colors,
  title,
  summary,
  collapsed,
  onToggle,
  children,
}: CollapsibleFilterPanelProps) {
  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.panelHeader}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
      >
        <Text style={[styles.panelTitleCompact, { color: colors.text }]}>{title}</Text>
        <View style={styles.panelHeaderMeta}>
          <Text style={[styles.panelSummary, { color: colors.textSecondary }]} numberOfLines={1}>
            {summary}
          </Text>
          <Text style={[styles.panelToggleText, { color: colors.tint }]}>{collapsed ? '展开' : '收起'}</Text>
        </View>
      </TouchableOpacity>

      {!collapsed ? <View style={styles.panelBody}>{children}</View> : null}
    </View>
  );
}

export const SearchFilterHeader = memo(function SearchFilterHeader({
  colors,
  tagMatchMode,
  onTagMatchModeChange,
  onlyUntagged,
  onOnlyUntaggedChange,
  missingCategoryId,
  missingCategoryOptions,
  onMissingCategoryPress,
  hasUnresolvedAssociation,
  onlyUnresolvedAssociation,
  onOnlyUnresolvedAssociationChange,
  fromLabel,
  toLabel,
  activeDateField,
  dateFrom,
  dateTo,
  onOpenDatePicker,
  onDateChange,
  onClearDateRange,
  onReset,
  onSearch,
  loading,
  totalCount,
  loadedCount,
  error,
  selectedTagIds,
  selectedTags,
  onRemoveTag,
  tagsError,
  tagsLoading,
  tags,
  categoryGroups,
  uncategorizedTags,
  onToggleTag,
  tagSelectionDisabled,
  tagSelectionDisabledHint,
  collapsedFilterPanels,
  onToggleFilterPanelCollapsed,
  collapsedCategories,
  onToggleCategoryCollapsed,
}: SearchFilterHeaderProps) {
  const tagMatchModeSummary = tagMatchMode === 'AND' ? '且（全部）' : '或（任意）';
  const tagStatusSummary = onlyUntagged ? '仅未打标签' : '不限';
  const selectedMissingCategory = missingCategoryOptions.find((category) => category.id === missingCategoryId);
  const missingCategorySummary =
    missingCategoryOptions.length === 0 ? '暂无可选' : selectedMissingCategory?.name ?? '不限';

  return (
    <View style={styles.header}>
      <CollapsibleFilterPanel
        colors={colors}
        title="标签匹配模式"
        summary={tagMatchModeSummary}
        collapsed={collapsedFilterPanels.tagMatchMode}
        onToggle={() => onToggleFilterPanelCollapsed('tagMatchMode')}
      >
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
              tagMatchMode === 'OR' && {
                borderColor: colors.tint,
                backgroundColor: colors.surfaceHighlight,
              },
            ]}
            onPress={() => onTagMatchModeChange('OR')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.modeButtonText,
                { color: colors.textSecondary },
                tagMatchMode === 'OR' && { color: colors.tint },
              ]}
            >
              或（任意）
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
              tagMatchMode === 'AND' && {
                borderColor: colors.tint,
                backgroundColor: colors.surfaceHighlight,
              },
            ]}
            onPress={() => onTagMatchModeChange('AND')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.modeButtonText,
                { color: colors.textSecondary },
                tagMatchMode === 'AND' && { color: colors.tint },
              ]}
            >
              且（全部）
            </Text>
          </TouchableOpacity>
        </View>
      </CollapsibleFilterPanel>

      <CollapsibleFilterPanel
        colors={colors}
        title="标签状态"
        summary={tagStatusSummary}
        collapsed={collapsedFilterPanels.tagStatus}
        onToggle={() => onToggleFilterPanelCollapsed('tagStatus')}
      >
        <View style={styles.chipWrap}>
          <TouchableOpacity
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.surface },
              !onlyUntagged && {
                borderColor: colors.tint,
                backgroundColor: colors.surfaceHighlight,
              },
            ]}
            onPress={() => onOnlyUntaggedChange(false)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: colors.textSecondary },
                !onlyUntagged && { color: colors.tint },
              ]}
            >
              不限
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.surface },
              onlyUntagged && {
                borderColor: colors.tint,
                backgroundColor: colors.surfaceHighlight,
              },
            ]}
            onPress={() => onOnlyUntaggedChange(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: colors.textSecondary },
                onlyUntagged && { color: colors.tint },
              ]}
            >
              仅未打标签
            </Text>
          </TouchableOpacity>
        </View>
      </CollapsibleFilterPanel>

      <CollapsibleFilterPanel
        colors={colors}
        title="缺失分类"
        summary={missingCategorySummary}
        collapsed={collapsedFilterPanels.missingCategory}
        onToggle={() => onToggleFilterPanelCollapsed('missingCategory')}
      >
        {missingCategoryOptions.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            暂无可选分类（分类下至少要有一个标签）。
          </Text>
        ) : (
          <View style={styles.chipWrap}>
            <TouchableOpacity
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                missingCategoryId == null && {
                  borderColor: colors.tint,
                  backgroundColor: colors.surfaceHighlight,
                },
              ]}
              onPress={() => onMissingCategoryPress(null)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.textSecondary },
                  missingCategoryId == null && { color: colors.tint },
                ]}
              >
                不限
              </Text>
            </TouchableOpacity>

            {missingCategoryOptions.map((category) => {
              const selected = missingCategoryId === category.id;
              return (
                <TouchableOpacity
                  key={`missing-category-${category.id}`}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    selected && {
                      borderColor: colors.tint,
                      backgroundColor: colors.surfaceHighlight,
                    },
                  ]}
                  onPress={() => onMissingCategoryPress(category.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: colors.textSecondary },
                      selected && { color: colors.tint },
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </CollapsibleFilterPanel>

      {hasUnresolvedAssociation ? (
        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>关联状态</Text>
          <View style={styles.chipWrap}>
            <TouchableOpacity
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                !onlyUnresolvedAssociation && {
                  borderColor: colors.tint,
                  backgroundColor: colors.surfaceHighlight,
                },
              ]}
              onPress={() => onOnlyUnresolvedAssociationChange(false)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.textSecondary },
                  !onlyUnresolvedAssociation && { color: colors.tint },
                ]}
              >
                不限
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.surface },
                onlyUnresolvedAssociation && {
                  borderColor: colors.tint,
                  backgroundColor: colors.surfaceHighlight,
                },
              ]}
              onPress={() => onOnlyUnresolvedAssociationChange(true)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: colors.textSecondary },
                  onlyUnresolvedAssociation && { color: colors.tint },
                ]}
              >
                未完成关联
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>拍摄日期范围</Text>
        <View style={styles.toolbar}>
          <Button
            title={fromLabel}
            onPress={() => onOpenDatePicker('from')}
            variant="outline"
            style={[styles.flexButton, styles.compactButton]}
            textStyle={styles.compactButtonText}
          />
          <View style={styles.gap} />
          <Button
            title={toLabel}
            onPress={() => onOpenDatePicker('to')}
            variant="outline"
            style={[styles.flexButton, styles.compactButton]}
            textStyle={styles.compactButtonText}
          />
        </View>

        {dateFrom || dateTo ? (
          <View style={styles.clearDateWrap}>
            <Button
              title="清除日期"
              onPress={onClearDateRange}
              variant="ghost"
              style={styles.inlineGhostButton}
              textStyle={styles.inlineGhostButtonText}
            />
          </View>
        ) : null}

        {activeDateField ? (
          <View style={styles.datePickerWrap}>
            <DateTimePicker
              value={(activeDateField === 'from' ? dateFrom : dateTo) ?? new Date()}
              mode="date"
              display="default"
              onChange={onDateChange}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <Button
          title="重置"
          onPress={onReset}
          variant="outline"
          style={[styles.flexButton, styles.compactButton]}
          textStyle={styles.compactButtonText}
          disabled={loading}
        />
        <View style={styles.gap} />
        <Button
          title="搜索"
          onPress={onSearch}
          style={[styles.flexButton, styles.compactButton]}
          textStyle={styles.compactButtonText}
          loading={loading}
        />
      </View>

      <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
        匹配到 {totalCount} 张照片，已加载 {loadedCount} 张
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>已选标签（{selectedTagIds.length}）</Text>
        {selectedTags.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {tagSelectionDisabled ? '已开启“仅未打标签”，当前不能同时按标签筛选。' : '未选择标签。你也可以仅按日期或状态筛选。'}
          </Text>
        ) : (
          <View style={styles.tagRow}>
            {selectedTags.map((tag) => (
              <TagBadge key={`selected-${tag.id}`} tag={tag} selected onPress={() => onRemoveTag(tag.id)} size="small" />
            ))}
          </View>
        )}
      </View>

      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>标签库</Text>
        {tagsError ? <Text style={styles.error}>{tagsError}</Text> : null}
        {tagSelectionDisabledHint ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{tagSelectionDisabledHint}</Text> : null}
        {tagsLoading && tags.length === 0 ? <Text style={[styles.hint, { color: colors.textSecondary }]}>标签加载中...</Text> : null}
        {!tagsLoading && tags.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>还没有标签。请前往 设置 {'>'} 标签管理 创建标签。</Text>
        ) : null}

        {categoryGroups.map(({ category, tags: groupTags }) => (
          <TagCategorySection
            key={category.id}
            category={category}
            tags={groupTags}
            selectedTagIds={selectedTagIds}
            onTagPress={onToggleTag}
            tagsDisabled={tagSelectionDisabled}
            collapsible
            collapsed={collapsedCategories[category.id] ?? false}
            onToggleCollapsed={() => onToggleCategoryCollapsed(category.id)}
          />
        ))}

        {uncategorizedTags.length > 0 ? (
          <TagCategorySection
            category={{
              id: UNCATEGORIZED_TAG_CATEGORY_ID,
              externalId: '__uncategorized__',
              name: '未分类',
              color: colors.textSecondary,
              sortOrder: 999,
              createdAt: '',
            }}
            tags={uncategorizedTags}
            selectedTagIds={selectedTagIds}
            onTagPress={onToggleTag}
            tagsDisabled={tagSelectionDisabled}
            collapsible
            collapsed={collapsedCategories[UNCATEGORIZED_TAG_CATEGORY_ID] ?? false}
            onToggleCollapsed={() => onToggleCategoryCollapsed(UNCATEGORIZED_TAG_CATEGORY_ID)}
          />
        ) : null}
      </View>
    </View>
  );
});

SearchFilterHeader.displayName = 'SearchFilterHeader';

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  panelTitleCompact: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    paddingRight: 12,
    flexShrink: 1,
  },
  panelHeaderMeta: {
    alignItems: 'flex-end',
    maxWidth: '58%',
    flexShrink: 1,
  },
  panelSummary: {
    fontSize: 12,
    lineHeight: 16,
  },
  panelToggleText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  panelBody: {
    marginTop: 10,
  },
  toolbar: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  flexButton: {
    flex: 1,
  },
  compactButton: {
    minHeight: 42,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  compactButtonText: {
    fontSize: 14,
    letterSpacing: 0,
  },
  inlineGhostButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  inlineGhostButtonText: {
    fontSize: 13,
    letterSpacing: 0,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: -2,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  gap: {
    width: 8,
  },
  clearDateWrap: {
    marginBottom: 4,
  },
  datePickerWrap: {
    marginTop: 4,
  },
  resultCount: {
    fontSize: 13,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  error: {
    color: '#ef4444',
    marginBottom: 10,
    fontSize: 13,
    paddingHorizontal: 2,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

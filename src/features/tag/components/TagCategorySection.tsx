import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { TagCategory, Tag } from '@/shared/types/domain';
import { TagBadge } from './TagBadge';
import { normalizeHexColor } from '@/shared/utils/color';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import Colors from '@/shared/theme/Colors';
import { BorderRadius, Spacing, FontSize } from '@/shared/theme/Theme';

interface TagCategorySectionProps {
  category: TagCategory;
  tags: Tag[];
  selectedTagIds: number[];
  onTagPress: (tagId: number) => void;
  tagsDisabled?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function TagCategorySection({
  category,
  tags,
  selectedTagIds,
  onTagPress,
  tagsDisabled = false,
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
}: TagCategorySectionProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  if (tags.length === 0) return null;

  const categoryColor = normalizeHexColor(category.color, themeColors.textSecondary);
  const isCollapsed = collapsible ? collapsed : false;

  const headerContent = (
    <View style={styles.headerMain}>
      <View style={[styles.dot, { backgroundColor: categoryColor }]} />
      <Text style={[styles.title, { color: themeColors.text }]}>{category.name}</Text>
    </View>
  );

  return (
    <View style={styles.section}>
      {collapsible ? (
        <TouchableOpacity
          style={[
            styles.headerPressable,
            { backgroundColor: themeColors.surfaceHighlight, borderColor: themeColors.border },
          ]}
          onPress={onToggleCollapsed}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: !isCollapsed }}
          disabled={!onToggleCollapsed}
        >
          {headerContent}
          <View style={styles.headerMeta}>
            <Text style={[styles.countText, { color: themeColors.textTertiary }]}>{tags.length} 个标签</Text>
            <Text style={[styles.toggleText, { color: themeColors.tint }]}>{isCollapsed ? '展开' : '收起'}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[styles.header, !isCollapsed && styles.headerBorder, { borderBottomColor: themeColors.border }]}>
          {headerContent}
        </View>
      )}

      {!isCollapsed && (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              selected={selectedTagIds.includes(tag.id)}
              onPress={() => onTagPress(tag.id)}
              size="small"
              disabled={tagsDisabled}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  headerBorder: {
    borderBottomWidth: 1,
  },
  headerPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: Spacing.md,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '600',
    flexShrink: 1,
  },
  countText: {
    fontSize: FontSize.xs,
    marginRight: Spacing.sm,
  },
  toggleText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

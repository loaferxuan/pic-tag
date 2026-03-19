import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { TagCategory, Tag } from '@/shared/types/domain';
import { TagBadge } from './TagBadge';
import { normalizeHexColor } from '@/shared/utils/color';

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
  if (tags.length === 0) return null;
  const categoryColor = normalizeHexColor(category.color, '#6B7280');
  const isCollapsed = collapsible ? collapsed : false;
  const headerContent = (
    <>
      <View style={styles.headerMain}>
        <View style={[styles.dot, { backgroundColor: categoryColor }]} />
        <Text style={styles.title}>{category.name}</Text>
      </View>

      {collapsible ? (
        <View style={styles.headerMeta}>
          <Text style={styles.countText}>{tags.length} 个标签</Text>
          <Text style={styles.toggleText}>{isCollapsed ? '展开' : '收起'}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.section}>
      {collapsible ? (
        <TouchableOpacity
          style={[styles.headerPressable, !isCollapsed && styles.headerPressableExpanded]}
          onPress={onToggleCollapsed}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: !isCollapsed }}
          disabled={!onToggleCollapsed}
        >
          {headerContent}
        </TouchableOpacity>
      ) : (
        <View style={styles.header}>{headerContent}</View>
      )}

      {!isCollapsed ? (
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#dbe3ea',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  headerPressableExpanded: {
    marginBottom: 8,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 12,
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
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  countText: {
    fontSize: 12,
    color: '#6b7280',
    marginRight: 8,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});

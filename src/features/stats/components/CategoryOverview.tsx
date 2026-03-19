import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CategoryStat } from '@/shared/types/domain';
import { normalizeHexColor } from '@/shared/utils/color';

interface CategoryOverviewProps {
  categories: CategoryStat[];
  onSelectCategory: (categoryId: number | null) => void;
}

export function CategoryOverview({
  categories,
  onSelectCategory,
}: CategoryOverviewProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>分类总览</Text>
      {categories.map((category) => {
        const color = normalizeHexColor(category.categoryColor, '#9CA3AF');

        return (
          <TouchableOpacity
            key={category.categoryId ?? 'uncategorized'}
            activeOpacity={0.75}
            style={styles.row}
            onPress={() => onSelectCategory(category.categoryId)}
          >
            <View style={styles.rowHeader}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={styles.name} numberOfLines={1}>
                {category.categoryName}
              </Text>
              <Text style={styles.chevron}>{'>'}</Text>
            </View>
            <Text style={styles.meta}>覆盖照片: {category.coveragePhotoCount}</Text>
          </TouchableOpacity>
        );
      })}

      {categories.length === 0 ? <Text style={styles.empty}>暂无分类数据</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  row: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginRight: 8,
  },
  name: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  meta: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 12,
  },
  empty: {
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 14,
  },
});

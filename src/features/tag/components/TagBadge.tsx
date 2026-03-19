import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Tag } from '@/shared/types/domain';
import { getContrastTextColor, hexToRgba, normalizeHexColor } from '@/shared/utils/color';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import Colors from '@/shared/theme/Colors';

interface TagBadgeProps {
  tag: Tag;
  onPress?: () => void;
  selected?: boolean;
  size?: 'small' | 'medium';
  disabled?: boolean;
}

const DEFAULT_UNSELECTED_BG_ALPHA = 0.12;
const DEFAULT_UNSELECTED_BORDER_ALPHA = 0.2;
const LIGHT_UNSELECTED_BG_ALPHA = 0.15;
const LIGHT_BORDER_COLOR = 'rgba(15,23,42,0.15)';

export function TagBadge({
  tag,
  onPress,
  selected = false,
  size = 'medium',
  disabled = false,
}: TagBadgeProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const color = normalizeHexColor(tag.color, themeColors.textSecondary);
  const contrastTextColor = getContrastTextColor(color);
  const isLightColor = contrastTextColor === '#111827';

  let backgroundColor = selected ? color : hexToRgba(color, DEFAULT_UNSELECTED_BG_ALPHA);
  let borderColor = selected ? themeColors.text : hexToRgba(color, DEFAULT_UNSELECTED_BORDER_ALPHA);
  let textColor = selected ? contrastTextColor : color;

  if (isLightColor) {
    if (selected) {
      textColor = '#111827';
    } else {
      backgroundColor = hexToRgba(color, LIGHT_UNSELECTED_BG_ALPHA);
      borderColor = LIGHT_BORDER_COLOR;
      textColor = '#1f2937';
    }
  }

  const content = (
    <View
      style={[
        styles.badge,
        size === 'small' && styles.small,
        {
          backgroundColor,
          borderColor,
          borderWidth: selected ? 2 : 1,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          size === 'small' && styles.textSmall,
          {
            color: textColor,
            fontWeight: selected ? '700' : '600',
          },
        ]}
        numberOfLines={1}
      >
        {tag.name}
      </Text>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={disabled ? 1 : 0.7} disabled={disabled}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 160,
  },
  small: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  text: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
  textSmall: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
});

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { Tag } from '@/shared/types/domain';
import { getContrastTextColor, hexToRgba, normalizeHexColor } from '@/shared/utils/color';
import { useColorScheme } from '@/shared/hooks/useColorScheme';
import Colors from '@/shared/theme/Colors';
import { BorderRadius } from '@/shared/theme/Theme';

interface TagBadgeProps {
  tag: Tag;
  onPress?: () => void;
  selected?: boolean;
  size?: 'small' | 'medium';
  disabled?: boolean;
}

const UNSELECTED_BG_ALPHA = 0.1;
const UNSELECTED_BORDER_ALPHA = 0.25;

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

  let backgroundColor = selected ? color : hexToRgba(color, UNSELECTED_BG_ALPHA);
  let borderColor = selected ? color : hexToRgba(color, UNSELECTED_BORDER_ALPHA);
  let textColor = selected ? contrastTextColor : color;

  if (isLightColor && !selected) {
    backgroundColor = hexToRgba(color, 0.12);
    borderColor = hexToRgba(color, 0.3);
    textColor = '#374151';
  }

  const isSmall = size === 'small';
  const paddingVertical = isSmall ? 4 : 6;
  const paddingHorizontal = isSmall ? 10 : 14;
  const fontSize = isSmall ? 12 : 13;
  const borderRadiusValue = isSmall ? BorderRadius.md : BorderRadius.lg;

  const content = (
    <View
      style={[
        styles.badge,
        {
          backgroundColor,
          borderColor,
          paddingVertical,
          paddingHorizontal,
          borderRadius: borderRadiusValue,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            fontSize,
            fontWeight: selected ? '600' : '500',
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
      <Pressable
        onPress={onPress}
        disabled={disabled}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
    maxWidth: 160,
  },
  text: {
    letterSpacing: 0.2,
  },
});

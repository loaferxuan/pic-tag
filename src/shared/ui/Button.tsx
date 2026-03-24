import React, { useMemo } from 'react';
import { Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, Pressable } from 'react-native';
import Colors from '@/shared/theme/Colors';
import { useColorScheme } from '@/shared/hooks/useColorScheme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const Button = React.memo(function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDisabled = disabled || loading;

  const backgroundColor = useMemo(() => {
    switch (variant) {
      case 'primary':
        return colors.tint;
      case 'secondary':
        return colorScheme === 'dark' ? colors.surfaceHighlight : colors.border;
      case 'outline':
      case 'ghost':
        return 'transparent';
      default:
        return colors.tint;
    }
  }, [variant, colors.tint, colors.surfaceHighlight, colors.border, colorScheme]);

  const textColor = useMemo(() => {
    switch (variant) {
      case 'primary':
        return '#ffffff';
      case 'secondary':
        return colors.text;
      case 'outline':
      case 'ghost':
        return colors.tint;
      default:
        return '#ffffff';
    }
  }, [variant, colors.tint, colors.text]);

  const outlineStyle = useMemo(
    () => (variant === 'outline' ? { borderWidth: 1, borderColor: colors.border } : {}),
    [variant, colors.border]
  );

  const disabledOpacity = isDisabled ? 0.5 : 1;

  return (
    <Pressable
      style={[
        styles.base,
        { backgroundColor, opacity: disabledOpacity },
        outlineStyle,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text style={[styles.text, { color: textColor }, textStyle]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 52,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  iconContainer: {
    marginRight: 8,
  },
});

import React from 'react';
import { Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
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

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const handlePressIn = () => {
    if (isDisabled) return;
    scale.value = withSpring(0.96, {
      damping: 10,
      stiffness: 400,
    });
    opacity.value = withTiming(0.8, { duration: 150 });
  };

  const handlePressOut = () => {
    if (isDisabled) return;
    scale.value = withSpring(1, {
      damping: 10,
      stiffness: 400,
    });
    opacity.value = withTiming(1, { duration: 150 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: isDisabled ? 0.5 : opacity.value,
  }));

  const getBackgroundColor = () => {
    switch (variant) {
      case 'primary':
        return colors.tint;
      case 'secondary':
        return colorScheme === 'dark' ? colors.surfaceHighlight : colors.border;
      case 'outline':
      case 'ghost':
        return 'transparent';
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
        return '#ffffff';
      case 'secondary':
        return colors.text;
      case 'outline':
      case 'ghost':
        return colors.tint;
    }
  };

  return (
    <AnimatedPressable
      style={[
        styles.base,
        { backgroundColor: getBackgroundColor() },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.border },
        style,
        animatedStyle,
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getTextColor()} />
      ) : (
        <>
          {icon && <Animated.View style={styles.iconContainer}>{icon}</Animated.View>}
          <Text style={[styles.text, { color: getTextColor() }, textStyle]}>{title}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16, // More rounded, modern feel
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

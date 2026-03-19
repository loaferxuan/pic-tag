import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { getContrastTextColor, isValidHexColor, normalizeHexColor, sanitizeColorInput } from '@/shared/utils/color';

const DEFAULT_COLOR = '#808080';
const DEFAULT_PRESETS = [
  '#FF0000',
  '#FFFF00',
  '#0000FF',
  '#7FDBFF',
  '#008000',
  '#FFA500',
  '#800080',
  '#FFFFFF',
  '#000000',
  '#808080',
  '#FFC0CB',
];

export function isColorDraftValid(color: string): boolean {
  return color.length === 0 || isValidHexColor(color);
}

interface TagColorEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  defaultColor?: string;
  presets?: string[];
}

export function TagColorEditor({
  label,
  value,
  onChange,
  defaultColor = DEFAULT_COLOR,
  presets = DEFAULT_PRESETS,
}: TagColorEditorProps) {
  const normalizedColor = normalizeHexColor(value, defaultColor);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <View style={[styles.preview, { backgroundColor: normalizedColor }]} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => onChange(sanitizeColorInput(text))}
          placeholder="#808080"
          placeholderTextColor="#9ca3af"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
        />
      </View>

      <View style={styles.presetWrap}>
        {presets.map((preset) => {
          const selected = normalizedColor === preset;
          return (
            <TouchableOpacity
              key={preset}
              style={[styles.presetItem, selected && styles.presetItemSelected]}
              onPress={() => onChange(preset)}
              activeOpacity={0.7}
            >
                <View style={[styles.presetColor, { backgroundColor: preset }]}>
                  {selected ? (
                  <Text style={[styles.presetSelectedText, { color: getContrastTextColor(preset) }]}>已选</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
          );
        })}
      </View>

      {value.length > 0 && !isValidHexColor(value) ? (
        <Text style={styles.errorText}>颜色格式需为 #RRGGBB</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  label: {
    color: '#374151',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  preview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#111827',
    fontSize: 14,
    lineHeight: 20,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  presetItem: {
    width: 30,
    height: 30,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetItemSelected: {
    borderColor: '#0f172a',
  },
  presetColor: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetSelectedText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 10,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
  },
});


import React, { memo, useCallback, useRef } from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import type { Photo } from '@/shared/types/domain';
import { usePhotoStore } from '@/features/photo/store/photo.store';
import { formatDate } from '@/shared/utils/format';

const { width } = Dimensions.get('window');
const COLS = 3;
const GAP = 4;
const SIZE = (width - GAP * (COLS + 1)) / COLS;

interface PhotoCardProps {
  photo: Photo;
  onPhotoPress: (photo: Photo) => void;
  showTags?: boolean;
}

function PhotoCardComponent({ photo, onPhotoPress, showTags = false }: PhotoCardProps) {
  const attemptedRepairRef = useRef(false);
  const hasImageUri = photo.uri.trim().length > 0;
  const handlePress = useCallback(() => {
    onPhotoPress(photo);
  }, [onPhotoPress, photo]);
  const handleImageError = useCallback(() => {
    if (attemptedRepairRef.current) return;
    attemptedRepairRef.current = true;
    if (!photo.sourceAssetId) return;
    void usePhotoStore.getState().repairPhotoUri(photo.id);
  }, [photo.id, photo.sourceAssetId]);

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.9}>
      {hasImageUri ? (
        <Image source={{ uri: photo.uri }} style={styles.image} resizeMode="cover" onError={handleImageError} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderText}>待关联</Text>
        </View>
      )}
      {showTags && (photo.tagIds?.length ?? 0) > 0 && (
        <View style={styles.tagRow}>
          <Text style={styles.tagCount} numberOfLines={1}>
            {(photo.tagIds?.length ?? 0)} 个标签
          </Text>
        </View>
      )}
      <Text style={styles.date} numberOfLines={1}>
        {formatDate(photo.takenDate ?? photo.importedAt, 'yyyy-MM-dd')}
      </Text>
    </TouchableOpacity>
  );
}

export const PhotoCard = memo(PhotoCardComponent);
PhotoCard.displayName = 'PhotoCard';

const styles = StyleSheet.create({
  card: {
    width: SIZE,
    margin: GAP / 2,
  },
  image: {
    width: SIZE,
    height: SIZE,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  placeholder: {
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  tagRow: {
    marginTop: 4,
    paddingHorizontal: 2,
  },
  tagCount: {
    fontSize: 11,
    color: '#6b7280',
  },
  date: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
    paddingHorizontal: 2,
  },
});

export const photoCardSize = SIZE;
export const photoCardGap = GAP;


import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { styles } from './QsealCascadeScreen.styles';

interface QsealChild {
  serialNumber: string;
}

interface ReviewViewProps {
  parentSerial: string | null;
  children: QsealChild[];
  error: string | null;
  isSubmitting: boolean;
  onBack: () => void;
  onRemoveChild: (serialNumber: string) => void;
  onFinalize: () => void;
  onAddMore: () => void;
}

export default function ReviewView({
  parentSerial,
  children,
  error,
  isSubmitting,
  onBack,
  onRemoveChild,
  onFinalize,
  onAddMore,
}: ReviewViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Scan</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Cascade</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.reviewContent}>
        {/* Parent card */}
        {parentSerial && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewSectionTitle}>Parent</Text>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Serial</Text>
              <Text style={styles.reviewValueMono}>{parentSerial}</Text>
            </View>
          </View>
        )}

        {/* Children list */}
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSectionTitle}>
            Children ({children.length})
          </Text>
          {children.length === 0 ? (
            <Text style={styles.emptyText}>No children scanned yet.</Text>
          ) : (
            children.map((child, idx) => (
              <View key={child.serialNumber} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemIndex}>#{idx + 1}</Text>
                  <Text style={styles.itemSerial}>{child.serialNumber}</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => onRemoveChild(child.serialNumber)}
                >
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Actions */}
        <TouchableOpacity
          style={[styles.linkCompleteBtn, isSubmitting && styles.buttonDisabled]}
          onPress={onFinalize}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.linkCompleteBtnText}>
              Link Complete ({children.length} child{children.length > 1 ? 'ren' : ''})
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.addMoreBtn} onPress={onAddMore}>
          <Text style={styles.addMoreBtnText}>+ Add More Children</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

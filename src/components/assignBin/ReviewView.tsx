import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { styles } from './AssignBinScreen.styles';
import type { BinInfo, ScannedItem } from './types';

interface ReviewViewProps {
  binInfo: BinInfo | null;
  items: ScannedItem[];
  error: string | null;
  onChangeBin: () => void;
  onRemoveItem: (index: number) => void;
  onBackToScan: () => void;
  onComplete: () => void;
}

export default function ReviewView({
  binInfo,
  items,
  error,
  onChangeBin,
  onRemoveItem,
  onBackToScan,
  onComplete,
}: ReviewViewProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Review Assignment</Text>
      </View>

      {/* Bin card */}
      {binInfo && (
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSectionTitle}>Bin</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Code</Text>
            <Text style={styles.reviewValue}>{binInfo.bin_code}</Text>
          </View>
          {binInfo.full_path !== binInfo.bin_code && (
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Path</Text>
              <Text style={styles.reviewValue}>{binInfo.full_path}</Text>
            </View>
          )}
          {binInfo.warehouse_name ? (
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Warehouse</Text>
              <Text style={styles.reviewValue}>{binInfo.warehouse_name}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.linkButton} onPress={onChangeBin}>
            <Text style={styles.linkButtonText}>🔄 Change Bin</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Items list */}
      <View style={styles.reviewCard}>
        <Text style={styles.reviewSectionTitle}>
          Items ({items.length})
        </Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No items scanned yet.</Text>
        ) : (
          items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemSku}>{item.sku}</Text>
                {item.name && <Text style={styles.itemName}>{item.name}</Text>}
                <View style={styles.itemMeta}>
                  <Text style={styles.itemMetaText}>Qty: {item.quantity}</Text>
                  {item.batch_number ? (
                    <Text style={styles.itemMetaText}>Batch: {item.batch_number}</Text>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity style={styles.removeButton} onPress={() => onRemoveItem(i)}>
                <Text style={styles.removeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Actions */}
      <View style={styles.reviewActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onBackToScan}>
          <Text style={styles.secondaryButtonText}>← Back to Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, (!binInfo || items.length === 0) && styles.buttonDisabled]}
          onPress={onComplete}
          disabled={!binInfo || items.length === 0}
        >
          <Text style={styles.primaryButtonText}>
            Complete ({items.length} items)
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

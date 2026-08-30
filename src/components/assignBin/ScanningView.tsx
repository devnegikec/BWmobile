import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import QrScanner from '@/components/QrScanner';
import { styles } from './AssignBinScreen.styles';

interface ScanningViewProps {
  binLocked: boolean;
  itemCount: number;
  onScan: (data: string) => void;
  onCancel: () => void;
  onReview: () => void;
}

export default function ScanningView({ binLocked, itemCount, onScan, onCancel, onReview }: ScanningViewProps) {
  return (
    <View style={styles.container}>
      {/* Status bar — minimal */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <Text style={styles.statusLabel}>
            {binLocked ? '🔒 Bin locked' : '📱 Waiting for bin'}
          </Text>
        </View>
        <View style={styles.statusRight}>
          <Text style={styles.statusCount}>{itemCount}</Text>
          <Text style={styles.statusCountLabel}>items</Text>
        </View>
      </View>

      {/* Scanner */}
      <QrScanner
        onScan={onScan}
        title={binLocked ? 'Scan Items' : 'Scan Bin or Item'}
        subtitle={
          binLocked
            ? `${itemCount} item(s) scanned`
            : 'Scan a bin QR first, or scan items'
        }
      />

      {/* Bottom actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, itemCount === 0 && styles.buttonDisabled]}
          onPress={onReview}
          disabled={itemCount === 0}
        >
          <Text style={styles.primaryButtonText}>
            Review ({itemCount})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

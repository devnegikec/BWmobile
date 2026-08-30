import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import QrScanner from '@/components/QrScanner';
import { styles } from './QsealCascadeScreen.styles';

interface ScanningViewProps {
  parentSerial: string | null;
  childCount: number;
  lastScanned: string | null;
  isScanning: boolean;
  onScan: (data: string) => void;
  onCancel: () => void;
  onReview: () => void;
}

export default function ScanningView({
  parentSerial,
  childCount,
  lastScanned,
  isScanning,
  onScan,
  onCancel,
  onReview,
}: ScanningViewProps) {
  const totalCount = (parentSerial ? 1 : 0) + childCount;

  return (
    <View style={styles.container}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <Text style={styles.statusLabel}>
            {parentSerial ? '🔒 Parent set' : '📱 Waiting for parent'}
          </Text>
          {parentSerial && (
            <Text style={styles.statusParentSerial} numberOfLines={1}>
              {parentSerial}
            </Text>
          )}
        </View>
        <View style={styles.statusRight}>
          <Text style={styles.statusCount}>{totalCount}</Text>
          <Text style={styles.statusCountLabel}>scans</Text>
        </View>
      </View>

      {/* Last scanned feedback + loading indicator */}
      {(lastScanned || isScanning) && (
        <View style={[styles.scanToast, isScanning && styles.scanToastLoading]}>
          {isScanning ? (
            <View style={styles.scanToastRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.scanToastText}> Resolving...</Text>
            </View>
          ) : (
            <Text style={styles.scanToastText}>
              ✅ {lastScanned}
              {parentSerial && lastScanned === parentSerial ? ' (Parent)' : ' (Child)'}
            </Text>
          )}
        </View>
      )}

      {/* QR Scanner */}
      <QrScanner
        onScan={onScan}
        title={parentSerial ? 'Scan Child QSeals' : 'Scan Parent QSeal'}
        subtitle={
          parentSerial
            ? `${childCount} child serial(s) scanned`
            : 'First scan will be set as the parent'
        }
      />

      {/* Bottom actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!parentSerial || childCount === 0) && styles.buttonDisabled,
          ]}
          onPress={onReview}
          disabled={!parentSerial || childCount === 0}
        >
          <Text style={styles.primaryButtonText}>
            Review ({childCount} children)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

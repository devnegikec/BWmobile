// ============================================================
// InboundScanningView — Full-screen QR scanning state
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import QrScanner from '../QrScanner';
import type { InboundSession, ScanRecord } from '../../types';

interface Props {
  session: InboundSession;
  lastScan: ScanRecord | null;
  isProcessingQSeal: boolean;
  qsealBoxCount: number;
  qsealItemCount: number;
  onScan: (data: string) => void;
  onViewSummary: () => void;
  onEndSession: () => void;
  onCancel: () => void;
}

export default function InboundScanningView({
  session,
  lastScan,
  isProcessingQSeal,
  qsealBoxCount,
  qsealItemCount,
  onScan,
  onViewSummary,
  onEndSession,
  onCancel,
}: Props) {
  return (
    <View style={styles.container}>
      {/* Session info bar */}
      <View style={styles.sessionBar}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionLabel}>Session Active</Text>
          <Text style={styles.sessionDock}>{session.dock_location}</Text>
          {session.asn_order_no && (
            <Text style={styles.sessionAsn}>📋 {session.asn_order_no}</Text>
          )}
        </View>
        <View style={styles.scanCount}>
          <Text style={styles.scanCountNum}>{session.total_boxes_scanned}</Text>
          <Text style={styles.scanCountLabel}>boxes</Text>
        </View>
      </View>

      {/* QR Scanner */}
      <QrScanner
        onScan={onScan}
        title="Scan Item QR Code"
        subtitle={`Dock: ${session.dock_location}`}
      />

      {/* Last scan feedback */}
      {lastScan && (
        <View style={styles.lastScanToast}>
          <Text style={styles.lastScanText}>
            ✅ {lastScan.sku} · Qty: {lastScan.raw_quantity} · {lastScan.batch_number || 'No batch'}
          </Text>
        </View>
      )}

      {/* QSeal count bar (compact) */}
      {isProcessingQSeal && (
        <View style={styles.linkedUnitsLoading}>
          <ActivityIndicator size="small" color="#1A73E8" />
          <Text style={styles.linkedUnitsLoadingText}>Fetching linked units...</Text>
        </View>
      )}
      {qsealBoxCount > 0 && (
        <View style={styles.qsealCountBar}>
          <Text style={styles.qsealCountText}>
            📦 {qsealBoxCount} box{qsealBoxCount > 1 ? 'es' : ''}
            {' · '}
            📋 {qsealItemCount} item{qsealItemCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.scanActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onViewSummary}>
          <Text style={styles.secondaryButtonText}>View Summary</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endButton} onPress={onEndSession}>
          <Text style={styles.endButtonText}>End Session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  sessionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  sessionInfo: {
    flex: 1,
  },
  backButton: {
    marginRight: 10,
    paddingHorizontal: 4,
  },
  backIcon: {
    color: '#B0C4D8',
    fontSize: 28,
    lineHeight: 28,
  },
  sessionLabel: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionDock: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  sessionAsn: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  scanCount: {
    alignItems: 'center',
  },
  scanCountNum: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  scanCountLabel: {
    color: '#8899AA',
    fontSize: 12,
  },
  lastScanToast: {
    position: 'absolute',
    top: 140,
    left: 20,
    right: 20,
    backgroundColor: '#1A3A2A',
    padding: 14,
    borderRadius: 10,
    zIndex: 10,
  },
  lastScanText: {
    color: '#4ADE80',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  scanActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#1A2332',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#B0C4D8',
    fontSize: 15,
    fontWeight: '600',
  },
  endButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  linkedUnitsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
  },
  linkedUnitsLoadingText: { color: '#8899AA', fontSize: 13 },
  qsealCountBar: {
    backgroundColor: '#1A2332',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  qsealCountText: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

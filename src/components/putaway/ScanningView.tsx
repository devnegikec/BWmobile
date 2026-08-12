// ============================================================
// ScanningView — Inbound-style scanning UI for Direct Put-Away
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import QrScanner from '../../components/QrScanner';

interface Props {
  warehouseName: string;
  boxCount: number;
  childCount: number;
  assignedCount: number;
  pendingCount: number;
  isProcessing: boolean;
  lastFeedback: string | null;
  errorMsg: string | null;
  onScan: (data: string) => void;
  onClearError: () => void;
  onViewAssign: () => void;
  onClear: () => void;
}

export function ScanningView({
  warehouseName, boxCount, childCount, assignedCount, pendingCount,
  isProcessing, lastFeedback, errorMsg,
  onScan, onClearError, onViewAssign, onClear,
}: Props) {
  const totalCount = boxCount + childCount;
  const hasItems = totalCount > 0;

  return (
    <View style={styles.container}>
      {/* Session bar */}
      <View style={styles.sessionBar}>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionLabel}>Direct Put-Away</Text>
          <Text style={styles.sessionDock}>{warehouseName}</Text>
        </View>
        <View style={styles.scanCount}>
          <Text style={styles.scanCountNum}>{boxCount}</Text>
          <Text style={styles.scanCountLabel}>boxes</Text>
        </View>
      </View>

      {/* Scanner */}
      <QrScanner
        onScan={onScan}
        title="Scan QSeal Box or Item QR"
        subtitle="Scan parent QSeal to capture all items"
      />

      {/* Processing */}
      {isProcessing && (
        <View style={styles.processingBar}>
          <ActivityIndicator size="small" color="#1A73E8" />
          <Text style={styles.processingText}>Fetching linked units...</Text>
        </View>
      )}

      {/* Error */}
      {errorMsg && (
        <View style={styles.errorToast}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity onPress={onClearError}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Last scan */}
      {lastFeedback && (
        <View style={styles.feedbackToast}>
          <Text style={styles.feedbackText}>{lastFeedback}</Text>
        </View>
      )}

      {/* Count bar */}
      {hasItems && (
        <View style={styles.countBar}>
          <Text style={styles.countText}>
            📦 {boxCount} box{boxCount !== 1 ? 'es' : ''} · 📋 {childCount} item{childCount !== 1 ? 's' : ''}
            {assignedCount > 0 && ` · ✅ ${assignedCount} done`}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      {hasItems && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.viewBtn} onPress={onViewAssign}>
            <Text style={styles.viewBtnText}>View & Assign ({pendingCount} pending)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={() => {
            Alert.alert('Clear All', 'Remove all scanned items?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: onClear },
            ]);
          }}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  sessionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 55, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#1A2332',
  },
  sessionInfo: { flex: 1 },
  sessionLabel: { color: '#1A73E8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  sessionDock: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 2 },
  scanCount: { backgroundColor: '#1A73E8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
  scanCountNum: { color: '#fff', fontSize: 18, fontWeight: '700' },
  scanCountLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  processingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: 'rgba(26,115,232,0.1)', gap: 8 },
  processingText: { color: '#8899AA', fontSize: 13 },
  errorToast: { marginHorizontal: 16, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center' },
  errorText: { color: '#FCA5A5', fontSize: 13, flex: 1 },
  errorDismiss: { color: '#FCA5A5', fontSize: 16, fontWeight: '700', paddingLeft: 12 },
  feedbackToast: { backgroundColor: 'rgba(26,35,50,0.95)', paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  feedbackText: { color: '#B0C4D8', fontSize: 13 },
  countBar: { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  countText: { color: '#10B981', fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', padding: 16, gap: 10 },
  viewBtn: { flex: 2, backgroundColor: '#1A2332', borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2A3A4A' },
  viewBtnText: { color: '#B0C4D8', fontSize: 15, fontWeight: '600' },
  clearBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  clearBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

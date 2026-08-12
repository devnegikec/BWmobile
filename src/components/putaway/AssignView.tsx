// ============================================================
// AssignView — Bin input + AssignAll (+scan) + AssignTable
// ============================================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import QrScanner from '../QrScanner';
import { AssignTable } from './AssignTable';
import type { TableRow } from '../../hooks/useDirectPutaway';

interface Props {
  boxCount: number;
  childCount: number;
  assignedCount: number;
  binId: string;
  isAssigning: boolean;
  rows: TableRow[];
  expandedBoxes: Set<string>;
  onBinChange: (v: string) => void;
  onAssignAll: (binId: string) => void;
  onToggleExpand: (key: string) => void;
  onAssignRow: (row: TableRow, binId: string) => Promise<void>;
  onBack: () => void;
}

export function AssignView({
  boxCount, childCount, assignedCount,
  binId, isAssigning, rows, expandedBoxes,
  onBinChange, onAssignAll, onToggleExpand,
  onAssignRow, onBack,
}: Props) {
  const [scanningBin, setScanningBin] = useState(false);

  // ── Handle bin QR scan ──
  const handleBinScan = (data: string) => {
    setScanningBin(false);
    const scanned = data.trim();
    onBinChange(scanned); // Fill the bin input
  };

  // ── Handle Assign All with scanner ──
  const handleAssignAllPress = () => {
    const bid = binId.trim();
    if (bid) {
      onAssignAll(bid);
    } else {
      // Open scanner to scan bin QR
      setScanningBin(true);
    }
  };

  // ── Handle row Assign ──
  const handleAssign = (row: TableRow) => {
    const bid = binId.trim();
    if (bid) {
      onAssignRow(row, bid);
    } else {
      Alert.alert('Bin Required', 'Enter or scan a bin ID first.');
    }
  };

  // ── Handle row Scan Bin ──
  const handleScanBinForRow = (row: TableRow) => {
    // Open scanner, then assign to the row
    setScanningBin(true);
    // Store the row to assign after scan
    (handleScanBinForRow as any)._pendingRow = row;
  };

  // ── Override bin scan to handle row-specific assignment ──
  const onBinScanned = (data: string) => {
    const scanned = data.trim();
    const pendingRow = (handleScanBinForRow as any)._pendingRow as TableRow | undefined;
    if (pendingRow) {
      // Row-specific scan → assign directly
      setScanningBin(false);
      onAssignRow(pendingRow, scanned);
      (handleScanBinForRow as any)._pendingRow = undefined;
    } else {
      // Assign All scan → fill bin input
      setScanningBin(false);
      onBinChange(scanned);
      // Auto-trigger assign all with the scanned bin
      setTimeout(() => onAssignAll(scanned), 300);
    }
  };

  return (
    <View style={styles.container}>
      {/* Scanner overlay */}
      {scanningBin && (
        <View style={styles.scannerOverlay}>
          <QrScanner
            onScan={onBinScanned}
            onClose={() => { setScanningBin(false); (handleScanBinForRow as any)._pendingRow = undefined; }}
            title="Scan Bin QR"
            subtitle="Scan the bin location QR code"
          />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>← Scanning</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Assign to Bins</Text>
        <Text style={styles.sub}>
          {boxCount} boxes · {childCount} items · {assignedCount} done
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Bin input + Assign All */}
        <View style={styles.binSection}>
          <Text style={styles.binLabel}>BIN LOCATION</Text>
          <View style={styles.binRow}>
            <TextInput
              style={styles.binInput}
              placeholder="Enter or scan bin ID"
              placeholderTextColor="#667788"
              value={binId}
              onChangeText={onBinChange}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.scanBinBtn} onPress={() => setScanningBin(true)}>
              <Text style={styles.scanBinBtnText}>📷</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.assignAllBtn, isAssigning && styles.assignAllBtnDisabled]}
              onPress={handleAssignAllPress}
              disabled={isAssigning}
            >
              {isAssigning ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.assignAllBtnText}>{binId.trim() ? 'Assign All' : 'Scan & Assign'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Table */}
        <AssignTable
          rows={rows}
          expandedBoxes={expandedBoxes}
          onToggleExpand={onToggleExpand}
          onAssign={handleAssign}
          onScanBin={handleScanBinForRow}
        />
      </ScrollView>

      {/* Back to scan */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.resumeBtn} onPress={onBack}>
          <Text style={styles.resumeBtnText}>Resume Scanning</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20, backgroundColor: '#0F1923' },
  header: { paddingTop: 55, paddingBottom: 16, paddingHorizontal: 16, backgroundColor: '#1A2332', borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
  backBtn: { color: '#1A73E8', fontSize: 15, fontWeight: '600', marginBottom: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sub: { color: '#8899AA', fontSize: 13, marginTop: 4 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  binSection: { marginBottom: 16 },
  binLabel: { color: '#667788', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  binRow: { flexDirection: 'row', gap: 8 },
  binInput: {
    flex: 1, backgroundColor: '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: '#2A3A4A',
    color: '#fff', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scanBinBtn: {
    backgroundColor: '#1A3A5C', borderRadius: 10, width: 48, alignItems: 'center', justifyContent: 'center',
  },
  scanBinBtnText: { fontSize: 22 },
  assignAllBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  assignAllBtnDisabled: { backgroundColor: '#374151' },
  assignAllBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  footer: { flexDirection: 'row', padding: 16, gap: 10 },
  resumeBtn: {
    flex: 1, backgroundColor: '#1A2332', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A3A4A',
  },
  resumeBtnText: { color: '#B0C4D8', fontSize: 15, fontWeight: '600' },
});

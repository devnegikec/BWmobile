// ============================================================
// AssignView — Bin input + AssignAll + AssignTable for Direct Put-Away
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Platform } from 'react-native';
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
  onAssignAll: () => void;
  onToggleExpand: (key: string) => void;
  onAssignSingle: (row: TableRow) => void;
  onBack: () => void;
}

export function AssignView({
  boxCount, childCount, assignedCount,
  binId, isAssigning, rows, expandedBoxes,
  onBinChange, onAssignAll, onToggleExpand,
  onAssignSingle, onBack,
}: Props) {
  return (
    <View style={styles.container}>
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
            <TouchableOpacity
              style={[styles.assignAllBtn, !binId.trim() && styles.assignAllBtnDisabled]}
              onPress={onAssignAll}
              disabled={!binId.trim() || isAssigning}
            >
              {isAssigning ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.assignAllBtnText}>Assign All</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Table */}
        <AssignTable
          rows={rows}
          expandedBoxes={expandedBoxes}
          onToggleExpand={onToggleExpand}
          onAssign={onAssignSingle}
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
  header: { paddingTop: 55, paddingBottom: 16, paddingHorizontal: 16, backgroundColor: '#1A2332', borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
  backBtn: { color: '#1A73E8', fontSize: 15, fontWeight: '600', marginBottom: 8 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sub: { color: '#8899AA', fontSize: 13, marginTop: 4 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  binSection: { marginBottom: 16 },
  binLabel: { color: '#667788', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  binRow: { flexDirection: 'row', gap: 10 },
  binInput: {
    flex: 1, backgroundColor: '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: '#2A3A4A',
    color: '#fff', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  assignAllBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  assignAllBtnDisabled: { backgroundColor: '#374151' },
  assignAllBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  footer: { flexDirection: 'row', padding: 16, gap: 10 },
  resumeBtn: {
    flex: 1, backgroundColor: '#1A2332', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A3A4A',
  },
  resumeBtnText: { color: '#B0C4D8', fontSize: 15, fontWeight: '600' },
});

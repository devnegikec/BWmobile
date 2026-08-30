// ============================================================
// AssignTable — Inbound Summary-style table for put-away items
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import type { TableRow } from '@/hooks/useDirectPutaway';

interface Props {
  rows: TableRow[];
  expandedBoxes: Set<string>;
  onToggleExpand: (key: string) => void;
  onAssign: (row: TableRow) => void;
  onScanBin: (row: TableRow) => void;
}

export function AssignTable({ rows, expandedBoxes, onToggleExpand, onAssign, onScanBin }: Props) {
  // Filter visible rows: boxes always visible; children only if parent expanded
  const visibleRows = rows.filter((r, idx, arr) => {
    if (r.type === 'box') return true;
    for (let i = idx - 1; i >= 0; i--) {
      if (arr[i].type === 'box') return expandedBoxes.has(arr[i].key);
    }
    return true;
  });

  if (visibleRows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No items scanned yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.table}>
      {/* Headers */}
      <View style={styles.headers}>
        <Text style={[styles.header, styles.colProduct]}>Product / SKU</Text>
        <Text style={[styles.header, styles.colBatch]}>Batch</Text>
        <Text style={[styles.header, styles.colQty]}>Qty</Text>
        <Text style={[styles.header, styles.colAction]}>Action</Text>
      </View>

      {visibleRows.map((row) => {
        const isChild = row.type === 'child';
        const isExpanded = row.isExpandable && expandedBoxes.has(row.key);

        return (
          <TouchableOpacity
            key={row.key}
            style={[styles.row, isChild && styles.rowChild, row.status === 'assigned' && styles.rowDone]}
            activeOpacity={row.isExpandable ? 0.7 : 1}
            onPress={() => row.isExpandable && onToggleExpand(row.key)}
            disabled={!row.isExpandable}
          >
            {/* Product / SKU */}
            <View style={[styles.cell, styles.colProduct]}>
              {isChild ? (
                <Text style={styles.serial} numberOfLines={1}>
                  {'   '}{row.productName}
                </Text>
              ) : (
                <>
                  <Text style={styles.name} numberOfLines={1}>
                    {isExpanded ? '▼ ' : '▶ '}{row.productName}
                  </Text>
                  <Text style={styles.sku}>{row.sku}</Text>
                </>
              )}
            </View>

            {/* Batch */}
            <View style={[styles.cell, styles.colBatch]}>
              <Text style={styles.batch} numberOfLines={1}>{row.batchNumber}</Text>
            </View>

            {/* Qty */}
            <View style={[styles.cell, styles.colQty]}>
              <Text style={styles.qty}>{row.itemCount}</Text>
            </View>

            {/* Action */}
            <View style={[styles.cell, styles.colAction]}>
              {renderAction(row, onAssign, onScanBin)}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Render the action cell based on item status */
function renderAction(
  row: TableRow,
  onAssign: (row: TableRow) => void,
  onScanBin: (row: TableRow) => void,
) {
  if (row.status === 'assigned' || row.status === 'already-done') {
    return (
      <View style={[styles.badge, styles.badgeDone]}>
        <Text style={styles.badgeText}>✓</Text>
      </View>
    );
  }
  if (row.status === 'rejected') {
    return (
      <View style={[styles.badge, styles.badgeRejected]}>
        <Text style={styles.badgeText}>🚫</Text>
      </View>
    );
  }
  if (row.status === 'not-found') {
    return <Text style={styles.naText}>—</Text>;
  }

  // Box row: single Assign button
  if (row.type === 'box') {
    return (
      <TouchableOpacity style={styles.assignBtn} onPress={() => onAssign(row)}>
        <Text style={styles.assignBtnText}>Assign ({row.itemCount})</Text>
      </TouchableOpacity>
    );
  }

  // Child row: Assign + Scan buttons
  return (
    <View style={styles.actionRow}>
      <TouchableOpacity style={styles.assignBtn} onPress={() => onAssign(row)}>
        <Text style={styles.assignBtnText}>Assign</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.scanBtn} onPress={() => onScanBin(row)}>
        <Text style={styles.scanBtnText}>📷</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  table: { backgroundColor: '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: '#2A3A4A', overflow: 'hidden' },
  headers: { flexDirection: 'row', backgroundColor: '#0F1923', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
  header: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  colProduct: { flex: 5, minWidth: 0 },
  colBatch: { flex: 2, minWidth: 0 },
  colQty: { width: 40, alignItems: 'center' as const },
  colAction: { width: 100, alignItems: 'flex-end' as const },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#0F1923' },
  rowChild: { backgroundColor: '#0F1923', paddingLeft: 6 },
  rowDone: { opacity: 0.5, backgroundColor: 'rgba(16,185,129,0.08)' },

  cell: { justifyContent: 'center' },
  name: { color: '#E0E8F0', fontSize: 12, fontWeight: '700' },
  serial: { color: '#8899AA', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  sku: { color: '#667788', fontSize: 10, marginTop: 1 },
  batch: { color: '#8899AA', fontSize: 11 },
  qty: { color: '#B0C4D8', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  assignBtn: { backgroundColor: '#1A73E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  assignBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  scanBtn: { backgroundColor: '#1A3A5C', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  scanBtnText: { fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: '#10B981' },
  badgeRejected: { backgroundColor: '#EF4444' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  naText: { color: '#667788', fontSize: 12 },

  empty: { padding: 30, alignItems: 'center' },
  emptyText: { color: '#667788', fontSize: 14 },
});

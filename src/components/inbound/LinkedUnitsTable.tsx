// ============================================================
// LinkedUnitsTable — Expandable QSeal linked-units table
// ============================================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { QSealParentWithUnits } from '../../types';

export default function LinkedUnitsTable({ parents }: { parents: QSealParentWithUnits[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!parents || parents.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const boxCount = parents.length;
  const itemCount = parents.reduce((sum, p) => sum + (p.linked_units?.length || 0), 0);

  return (
    <View style={styles.tableContainer}>
      {/* Summary header */}
      <View style={styles.tableHeader}>
        <Text style={styles.tableHeaderText}>
          📦 {boxCount} box{boxCount > 1 ? 'es' : ''} · 📋 {itemCount} item{itemCount > 1 ? 's' : ''}
        </Text>
      </View>

      {/* Column headers */}
      <View style={styles.tableColHeaders}>
        <Text style={[styles.colHeader, styles.colProduct]}>Product</Text>
        <Text style={[styles.colHeader, styles.colSku]}>SKU</Text>
        <Text style={[styles.colHeader, styles.colBatch]}>Batch</Text>
        <Text style={[styles.colHeader, styles.colBox]}>Box</Text>
        <Text style={[styles.colHeader, styles.colQty]}>Qty</Text>
      </View>

      {/* Parent rows */}
      {parents.map((parent, pIdx) => {
        const isOpen = expanded.has(parent.id);
        const units = parent.linked_units || [];
        const firstUnit = units[0];
        return (
          <View key={parent.id}>
            <TouchableOpacity
              style={styles.parentRow}
              onPress={() => toggleExpand(parent.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.cell, styles.colProduct]} numberOfLines={1}>
                {isOpen ? '▼ ' : '▶ '}{firstUnit?.product_name || parent.name}
              </Text>
              <Text style={[styles.cell, styles.colSku]} numberOfLines={1}>
                {firstUnit?.product_sku || '-'}
              </Text>
              <Text style={[styles.cell, styles.colBatch]} numberOfLines={1}>
                {firstUnit?.dispatch_batch || '-'}
              </Text>
              <Text style={[styles.cell, styles.colBox]}>
                {pIdx + 1}/{boxCount}
              </Text>
              <Text style={[styles.cell, styles.colQty]}>
                {units.length}
              </Text>
            </TouchableOpacity>

            {/* Expanded: unit details */}
            {isOpen &&
              units.map((unit) => (
                <View key={unit.id} style={styles.unitRow}>
                  <Text style={[styles.cell, styles.colProduct]} numberOfLines={1}>
                    {'    '}└ {unit.serial_number}
                  </Text>
                  <Text style={[styles.cell, styles.colSku]}>
                    {unit.product_sku || '-'}
                  </Text>
                  <Text style={[styles.cell, styles.colBatch]}>
                    {unit.dispatch_batch || '-'}
                  </Text>
                  <Text style={[styles.cell, styles.colBox]}> </Text>
                  <Text style={[styles.cell, styles.colQty]}>1</Text>
                </View>
              ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tableContainer: {
    backgroundColor: '#1A2332',
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    overflow: 'hidden',
    maxHeight: 220,
  },
  tableHeader: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  tableHeaderText: { color: '#4ADE80', fontSize: 12, fontWeight: '700' },
  tableColHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0F1923',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  colHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  colProduct: { flex: 3, minWidth: 0 },
  colSku: { flex: 2, minWidth: 0 },
  colBatch: { flex: 2, minWidth: 0 },
  colBox: { width: 40, textAlign: 'center' },
  colQty: { width: 30, textAlign: 'center' },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#0F1923',
    borderBottomWidth: 1,
    borderBottomColor: '#1A2332',
  },
  cell: { color: '#B0C4D8', fontSize: 12 },
});

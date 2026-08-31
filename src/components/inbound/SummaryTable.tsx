// ============================================================
// SummaryTable — main session summary table (expandable parents)
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { styles } from './SummaryView.styles';
import type { TableRow } from './summaryTypes';

interface SummaryTableProps {
  rows: TableRow[];
  expandedParents: Set<string>;
  isRejected: (row: TableRow) => boolean;
  onToggleExpand: (key: string) => void;
  onReject: (row: TableRow) => void;
  onUnreject: (row: TableRow) => void;
}

export default function SummaryTable({
  rows,
  expandedParents,
  isRejected,
  onToggleExpand,
  onReject,
  onUnreject,
}: SummaryTableProps) {
  return (
    <View style={styles.unifiedTable}>
      {/* Column headers */}
      <View style={styles.utColHeaders}>
        <Text style={[styles.utColHeader, styles.utColProduct]}>Product / SKU</Text>
        <Text style={[styles.utColHeader, styles.utColBatch]}>Batch</Text>
        <Text style={[styles.utColHeader, styles.utColBoxes]}>Boxes / Items</Text>
        <Text style={[styles.utColHeader, styles.utColAction]}>Action</Text>
      </View>

      {rows.map((row) => {
        const isRejectedRow = isRejected(row);
        const isChild = row.depth > 0;
        const isExpanded = row.isExpandable && expandedParents.has(row.key);

        return (
          <TouchableOpacity
            key={row.key}
            style={[
              styles.utRow,
              isChild && styles.utRowChild,
              isRejectedRow && styles.utRowRejected,
            ]}
            onPress={() => {
              if (row.isExpandable) onToggleExpand(row.key);
            }}
            activeOpacity={row.isExpandable ? 0.7 : 1}
            disabled={!row.isExpandable}
          >
            {/* Col 1: Product/SKU (parent) or Serial Number (child) */}
            <View style={[styles.utCell, styles.utColProduct]}>
              {isChild ? (
                <>
                  <Text
                    style={[styles.utSerialNumber, isRejectedRow && styles.utTextRejected]}
                    numberOfLines={1}
                  >
                    {'  '}{row.productName}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={[styles.utProductName, isRejectedRow && styles.utTextRejected]}
                    numberOfLines={1}
                  >
                    {row.isExpandable ? (isExpanded ? '▼ ' : '▶ ') : ''}{row.productName}
                  </Text>
                  <Text style={[styles.utSku, isRejectedRow && styles.utTextRejected]}>
                    {row.sku}
                  </Text>
                </>
              )}
            </View>

            {/* Col 2: Batch */}
            <View style={[styles.utCell, styles.utColBatch]}>
              <Text style={[styles.utBatch, isRejectedRow && styles.utTextRejected]}>
                {row.batchNumber}
              </Text>
            </View>

            {/* Col 3: Boxes/Items (parent) or Qty (child) */}
            <View style={[styles.utCell, styles.utColBoxes]}>
              <Text style={[styles.utBoxItems, isRejectedRow && styles.utTextRejected]}>
                {isChild ? row.itemCount : `${row.boxCount}/${row.itemCount}`}
              </Text>
            </View>

            {/* Col 4: Action */}
            <View style={[styles.utCell, styles.utColAction]}>
              <TouchableOpacity
                style={[styles.utRejectBtn, isRejectedRow && styles.utRejectBtnActive]}
                onPress={() => {
                  if (isRejectedRow) {
                    onUnreject(row);
                  } else {
                    const label = row.type === 'qseal-parent'
                      ? `${row.productName} (+${row.itemCount} items)`
                      : row.productName;
                    Alert.alert(
                      'Confirm Rejection',
                      `Reject "${label}"?\nThis will move it to the reject list.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Reject',
                          style: 'destructive',
                          onPress: () => onReject(row),
                        },
                      ]
                    );
                  }
                }}
              >
                <Text style={[styles.utRejectBtnText, isRejectedRow && styles.utRejectBtnTextActive]}>
                  {isRejectedRow ? 'Rejected' : 'Reject'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

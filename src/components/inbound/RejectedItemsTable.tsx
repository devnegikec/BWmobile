// ============================================================
// RejectedItemsTable — rejected items list shown on session summary
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './SummaryView.styles';
import type { TableRow } from './summaryTypes';

interface RejectedItemsTableProps {
  rows: TableRow[];
  getRejectReason: (row: TableRow) => string;
  onUndo: (row: TableRow) => void;
}

export default function RejectedItemsTable({
  rows,
  getRejectReason,
  onUndo,
}: RejectedItemsTableProps) {
  if (rows.length === 0) return null;

  return (
    <View style={styles.rejectListContainer}>
      <View style={styles.rejectListHeader}>
        <Text style={styles.rejectListTitle}>
          🚫 Rejected Items ({rows.length})
        </Text>
      </View>

      {/* Column headers (same format) */}
      <View style={styles.utColHeaders}>
        <Text style={[styles.utColHeader, styles.utColProduct]}>Product / SKU</Text>
        <Text style={[styles.utColHeader, styles.utColBatch]}>Batch</Text>
        <Text style={[styles.utColHeader, styles.utColBoxes]}>Boxes / Items</Text>
        <Text style={[styles.utColHeader, styles.utColAction]}>Action</Text>
      </View>

      {rows.map((row) => {
        const reason = getRejectReason(row);
        const isChild = row.depth > 0;

        return (
          <View key={`rej-${row.key}`} style={[styles.utRow, styles.utRowRejected, isChild && styles.utRowChild]}>
            {/* Col 1: Product/SKU (parent) or Serial Number (child) */}
            <View style={[styles.utCell, styles.utColProduct]}>
              {isChild ? (
                <Text style={[styles.utSerialNumber, styles.utTextRejected]} numberOfLines={1}>
                  {'  └ '}{row.productName}
                </Text>
              ) : (
                <>
                  <Text style={[styles.utProductName, styles.utTextRejected]} numberOfLines={1}>
                    {row.productName}
                  </Text>
                  <Text style={[styles.utSku, styles.utTextRejected]}>{row.sku}</Text>
                </>
              )}
              {reason ? (
                <Text style={styles.rejectListReason} numberOfLines={1}>{reason}</Text>
              ) : null}
            </View>
            <View style={[styles.utCell, styles.utColBatch]}>
              <Text style={[styles.utBatch, styles.utTextRejected]}>{row.batchNumber}</Text>
            </View>
            <View style={[styles.utCell, styles.utColBoxes]}>
              <Text style={[styles.utBoxItems, styles.utTextRejected]}>
                {isChild ? row.itemCount : `${row.boxCount}/${row.itemCount}`}
              </Text>
            </View>
            <View style={[styles.utCell, styles.utColAction]}>
              <TouchableOpacity
                style={styles.utUndoBtn}
                onPress={() => onUndo(row)}
              >
                <Text style={styles.utUndoBtnText}>Undo</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

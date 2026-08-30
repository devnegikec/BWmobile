// ============================================================
// SummaryView — Session review with rejection toggles
// ============================================================
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import { useInboundStore } from '@/store/inboundStore';
import type { SessionSummary, InboundSession, QSealParentWithUnits } from '@/types';

interface Props {
  sessionSummary: SessionSummary;
  session: InboundSession;
  linkedUnitsParents: QSealParentWithUnits[];
  onResumeScanning: () => void;
  onEndSession: () => void;
}

interface TableRow {
  key: string;
  type: 'qseal-parent' | 'qseal-child' | 'scan-batch';
  productName: string;
  sku: string;
  batchNumber: string;
  boxCount: number;
  itemCount: number;
  rejectKey: string;
  parentKey?: string;
  depth: number;
  isExpandable: boolean;
}

export default function SummaryView({
  sessionSummary,
  session,
  linkedUnitsParents,
  onResumeScanning,
  onEndSession,
}: Props) {
  const itemRejections = useInboundStore((s) => s.itemRejections);
  const toggleItemRejection = useInboundStore((s) => s.toggleItemRejection);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // ---- Build unified table rows ----
  const rows: TableRow[] = [];

  // 1. QSeal parents + children
  linkedUnitsParents.forEach((parent) => {
    const units = parent.linked_units || [];
    const firstUnit = units[0];
    const parentKey = `qseal-parent||${parent.id}`;

    rows.push({
      key: parentKey,
      type: 'qseal-parent',
      productName: firstUnit?.product_name || parent.name,
      sku: firstUnit?.product_sku || '-',
      batchNumber: firstUnit?.dispatch_batch || '-',
      boxCount: 1,
      itemCount: units.length,
      rejectKey: parentKey,
      depth: 0,
      isExpandable: units.length > 0,
    });

    units.forEach((unit) => {
      const childKey = `qseal-child||${unit.id}`;
      rows.push({
        key: childKey,
        type: 'qseal-child',
        productName: unit.serial_number,
        sku: unit.product_sku || '-',
        // Use serial_number for matching because the slip API
        // returns batch_number = serial_number
        batchNumber: unit.serial_number || unit.dispatch_batch || '-',
        boxCount: 1,
        itemCount: 1,
        rejectKey: childKey,
        parentKey: parentKey,
        depth: 1,
        isExpandable: false,
      });
    });
  });

  // Compute reject states
  const getIsRejected = (row: TableRow) => itemRejections[row.rejectKey]?.rejected || false;
  const getRejectReason = (row: TableRow) => itemRejections[row.rejectKey]?.reason || '';

  const rejectedRows = rows.filter((r) => getIsRejected(r));
  const rejectedCount = rejectedRows.length;

  // Helper: reject a parent + all its children
  const rejectParent = (parentKey: string, reason: string) => {
    const parent = rows.find((r) => r.key === parentKey);
    if (!parent) return;
    toggleItemRejection(parent.sku, parent.batchNumber, true, reason);
    // Also set the parent key
    useInboundStore.setState((s) => ({
      itemRejections: {
        ...s.itemRejections,
        [parentKey]: { rejected: true, reason },
      },
    }));
    // Cascade to children
    rows
      .filter((r) => r.parentKey === parentKey)
      .forEach((child) => {
        useInboundStore.setState((s) => ({
          itemRejections: {
            ...s.itemRejections,
            [child.rejectKey]: { rejected: true, reason: `Parent rejected: ${reason}` },
          },
        }));
      });
  };

  // Helper: reject a single row
  const rejectRow = (row: TableRow, reason: string) => {
    if (row.type === 'qseal-parent') {
      rejectParent(row.rejectKey, reason);
    } else {
      toggleItemRejection(row.sku, row.batchNumber, true, reason);
      // Also store by serial number (batchNumber = serial for child items)
      const serialNumber = row.batchNumber; // Now equals serial_number
      useInboundStore.setState((s) => ({
        itemRejections: {
          ...s.itemRejections,
          [row.rejectKey]: { rejected: true, reason },
          ...(serialNumber && serialNumber !== '-' ? { [serialNumber]: { rejected: true, reason } } : {}),
        },
      }));
    }
  };

  // Helper: unreject
  const unrejectRow = (row: TableRow) => {
    if (row.type === 'qseal-parent') {
      useInboundStore.setState((s) => {
        const next = { ...s.itemRejections };
        delete next[row.rejectKey];
        rows
          .filter((r) => r.parentKey === row.rejectKey)
          .forEach((child) => delete next[child.rejectKey]);
        return { itemRejections: next };
      });
    } else {
      toggleItemRejection(row.sku, row.batchNumber, false);
      useInboundStore.setState((s) => {
        const next = { ...s.itemRejections };
        delete next[row.rejectKey];
        return { itemRejections: next };
      });
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Visible rows: parents always visible; children only if parent expanded
  const visibleRows = rows.filter((r) => {
    if (r.depth === 0) return true;
    return r.parentKey && expandedParents.has(r.parentKey);
  });

  return (
    <ScreenContainer
      title="Session Summary"
      subtitle={`${sessionSummary.total_boxes} boxes · ${sessionSummary.total_quantity} qty`}
      scrollable
      contentContainerStyle={styles.summaryContent}
    >
      {session.asn_order_no && (
        <Text style={styles.summaryAsnRef}>📋 Linked to {session.asn_order_no}</Text>
      )}

      {/* Rejection summary bar */}
      {rejectedCount > 0 && (
        <View style={styles.rejectionSummaryBar}>
          <Text style={styles.rejectionSummaryText}>
            ⚠️ {rejectedCount} item(s) marked for rejection
          </Text>
        </View>
      )}

      {/* ---- MAIN TABLE ---- */}
      <View style={styles.unifiedTable}>
        {/* Column headers */}
        <View style={styles.utColHeaders}>
          <Text style={[styles.utColHeader, styles.utColProduct]}>Product / SKU</Text>
          <Text style={[styles.utColHeader, styles.utColBatch]}>Batch</Text>
          <Text style={[styles.utColHeader, styles.utColBoxes]}>Boxes / Items</Text>
          <Text style={[styles.utColHeader, styles.utColAction]}>Action</Text>
        </View>

        {visibleRows.map((row) => {
          const isRejected = getIsRejected(row);
          const isChild = row.depth > 0;
          const isExpanded = row.isExpandable && expandedParents.has(row.key);

          return (
            <TouchableOpacity
              key={row.key}
              style={[
                styles.utRow,
                isChild && styles.utRowChild,
                isRejected && styles.utRowRejected,
              ]}
              onPress={() => {
                if (row.isExpandable) toggleExpand(row.key);
              }}
              activeOpacity={row.isExpandable ? 0.7 : 1}
              disabled={!row.isExpandable}
            >
              {/* Col 1: Product/SKU (parent) or Serial Number (child) */}
              <View style={[styles.utCell, styles.utColProduct]}>
                {isChild ? (
                  <>
                    <Text
                      style={[styles.utSerialNumber, isRejected && styles.utTextRejected]}
                      numberOfLines={1}
                    >
                      {'  '}{row.productName}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text
                      style={[styles.utProductName, isRejected && styles.utTextRejected]}
                      numberOfLines={1}
                    >
                      {row.isExpandable ? (isExpanded ? '▼ ' : '▶ ') : ''}{row.productName}
                    </Text>
                    <Text style={[styles.utSku, isRejected && styles.utTextRejected]}>
                      {row.sku}
                    </Text>
                  </>
                )}
              </View>

              {/* Col 2: Batch */}
              <View style={[styles.utCell, styles.utColBatch]}>
                <Text style={[styles.utBatch, isRejected && styles.utTextRejected]}>
                  {row.batchNumber}
                </Text>
              </View>

              {/* Col 3: Boxes/Items (parent) or Qty (child) */}
              <View style={[styles.utCell, styles.utColBoxes]}>
                <Text style={[styles.utBoxItems, isRejected && styles.utTextRejected]}>
                  {isChild ? row.itemCount : `${row.boxCount}/${row.itemCount}`}
                </Text>
              </View>

              {/* Col 4: Action */}
              <View style={[styles.utCell, styles.utColAction]}>
                <TouchableOpacity
                  style={[styles.utRejectBtn, isRejected && styles.utRejectBtnActive]}
                  onPress={() => {
                    if (isRejected) {
                      unrejectRow(row);
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
                            onPress: () => rejectRow(row, 'Rejected during review'),
                          },
                        ]
                      );
                    }
                  }}
                >
                  <Text style={[styles.utRejectBtnText, isRejected && styles.utRejectBtnTextActive]}>
                    {isRejected ? 'Rejected' : 'Reject'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ---- REJECT LIST ---- */}
      {rejectedRows.length > 0 && (
        <View style={styles.rejectListContainer}>
          <View style={styles.rejectListHeader}>
            <Text style={styles.rejectListTitle}>
              🚫 Rejected Items ({rejectedRows.length})
            </Text>
          </View>

          {/* Column headers (same format) */}
          <View style={styles.utColHeaders}>
            <Text style={[styles.utColHeader, styles.utColProduct]}>Product / SKU</Text>
            <Text style={[styles.utColHeader, styles.utColBatch]}>Batch</Text>
            <Text style={[styles.utColHeader, styles.utColBoxes]}>Boxes / Items</Text>
            <Text style={[styles.utColHeader, styles.utColAction]}>Action</Text>
          </View>

          {rejectedRows.map((row) => {
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
                    onPress={() => unrejectRow(row)}
                  >
                    <Text style={styles.utUndoBtnText}>Undo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.summaryActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onResumeScanning}>
          <Text style={styles.secondaryButtonText}>Resume Scanning</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endButton} onPress={onEndSession}>
          <Text style={styles.endButtonText}>
            End & Generate Slip{rejectedCount > 0 ? ` (${rejectedCount} rejected)` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summaryContent: {
    paddingBottom: 40,
  },
  summaryAsnRef: {
    color: '#60A5FA',
    fontSize: 13,
    marginTop: 12,
    marginHorizontal: 24,
  },
  rejectionSummaryBar: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  rejectionSummaryText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  unifiedTable: {
    marginHorizontal: 5,
    marginTop: 16,
    backgroundColor: '#1A2332',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    overflow: 'hidden',
  },
  utColHeaders: {
    flexDirection: 'row',
    backgroundColor: '#0F1923',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  utColHeader: {
    color: '#667788',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  utColProduct: { flex: 5, minWidth: 0 },
  utColBatch: { flex: 2, minWidth: 0 },
  utColBoxes: { width: 55, alignItems: 'center' as const },
  utColAction: { width: 62, alignItems: 'flex-end' as const },
  utRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  utRowChild: {
    backgroundColor: '#0F1923',
    paddingLeft: 6,
  },
  utRowRejected: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  utCell: {
    justifyContent: 'center',
  },
  utProductName: {
    color: '#E0E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  utSerialNumber: {
    color: '#8899AA',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  utSku: {
    color: '#667788',
    fontSize: 10,
    marginTop: 1,
  },
  utBatch: {
    color: '#8899AA',
    fontSize: 11,
  },
  utBoxItems: {
    color: '#B0C4D8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  utTextRejected: {
    color: '#FCA5A5',
    textDecorationLine: 'line-through' as const,
  },
  utRejectBtn: {
    backgroundColor: '#2A3A4A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  utRejectBtnActive: {
    backgroundColor: '#EF4444',
  },
  utRejectBtnText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
  },
  utRejectBtnTextActive: {
    color: '#fff',
  },
  utUndoBtn: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  utUndoBtnText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },
  rejectListContainer: {
    marginHorizontal: 5,
    marginTop: 24,
    backgroundColor: '#1A2332',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    overflow: 'hidden',
  },
  rejectListHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EF4444',
  },
  rejectListTitle: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  rejectListReason: {
    color: '#FCA5A5',
    fontSize: 9,
    marginTop: 2,
  },
  summaryActions: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
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
});

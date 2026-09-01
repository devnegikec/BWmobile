// ============================================================
// SummaryView — Session review with rejection toggles
// ============================================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import { useInboundStore } from '@/store/inboundStore';
import type { SessionSummary, InboundSession, QSealParentWithUnits } from '@/types';
import SummaryTable from './SummaryTable';
import RejectedItemsTable from './RejectedItemsTable';
import { styles } from './SummaryView.styles';
import type { TableRow } from './summaryTypes';

interface Props {
  sessionSummary: SessionSummary;
  session: InboundSession;
  linkedUnitsParents: QSealParentWithUnits[];
  onResumeScanning: () => void;
  onEndSession: () => void;
  onRemoveParent: (parentId: string) => void;
}

export default function SummaryView({
  sessionSummary,
  session,
  linkedUnitsParents,
  onResumeScanning,
  onEndSession,
  onRemoveParent,
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

  // Helper: remove a scanned QSeal parent (wrong QR scanned by mistake)
  const handleRemoveParent = (row: TableRow) => {
    const parentId = row.key.replace('qseal-parent||', '');
    const parent = linkedUnitsParents.find((p) => p.id === parentId);
    const itemCount = parent?.linked_units?.length || 0;
    Alert.alert(
      'Remove Box',
      `Remove "${row.productName}"${itemCount > 0 ? ` and its ${itemCount} item(s)` : ''} from this session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onRemoveParent(parentId) },
      ]
    );
  };

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
      <SummaryTable
        rows={visibleRows}
        expandedParents={expandedParents}
        isRejected={getIsRejected}
        onToggleExpand={toggleExpand}
        onReject={(row) => rejectRow(row, 'Rejected during review')}
        onUnreject={unrejectRow}
        onRemoveParent={handleRemoveParent}
      />

      {/* ---- REJECT LIST ---- */}
      <RejectedItemsTable
        rows={rejectedRows}
        getRejectReason={getRejectReason}
        onUndo={unrejectRow}
      />

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


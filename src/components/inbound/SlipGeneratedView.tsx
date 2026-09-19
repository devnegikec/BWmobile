// ============================================================
// SlipGeneratedView — Success state after slip generation
// ============================================================
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import SummaryTable from './SummaryTable';
import type { TableRow } from './summaryTypes';
import type { ReceivingSlip, QSealParentWithUnits } from '@/types';

interface Props {
  slip: ReceivingSlip;
  linkedUnitsParents: QSealParentWithUnits[];
  onNewSession: () => void;
}

export default function SlipGeneratedView({ slip, linkedUnitsParents, onNewSession }: Props) {
  // The API returns either the newer grouped format (`groups`) or the
  // legacy flat format (`items`). Normalize both into the same table rows
  // that the inbound SummaryView uses, so the success screen reuses the
  // exact same table component.
  const rows = useMemo<TableRow[]>(() => {
    const next: TableRow[] = [];

    // 1. Grouped format: one parent QSeal box + its linked child units
    (slip.groups ?? []).forEach((group, groupIndex) => {
      const items = group.items ?? [];
      const parentKey = `slip-parent||${group.parent_qseal?.id ?? groupIndex}`;

      next.push({
        key: parentKey,
        type: 'qseal-parent',
        productName: group.product_name || group.parent_qseal?.name || '-',
        sku: items[0]?.sku || '-',
        batchNumber: group.parent_qseal?.batch || items[0]?.batch_number || '-',
        boxCount: 1,
        itemCount: items.length,
        rejectKey: parentKey,
        depth: 0,
        isExpandable: items.length > 0,
      });

      items.forEach((item) => {
        const childKey = `slip-child||${item.id}`;
        next.push({
          key: childKey,
          type: 'qseal-child',
          productName: item.serial_number,
          sku: item.sku || '-',
          batchNumber: item.batch_number || '-',
          boxCount: item.box_count || 1,
          itemCount: item.quantity || 1,
          rejectKey: childKey,
          parentKey,
          depth: 1,
          isExpandable: false,
        });
      });
    });

    // 2. Legacy flat format
    if (next.length === 0) {
      (slip.items ?? []).forEach((item, itemIndex) => {
        const key = `slip-item||${item.id ?? itemIndex}`;
        next.push({
          key,
          type: 'scan-batch',
          productName: item.sku,
          sku: item.sku,
          batchNumber: item.batch_number || '-',
          boxCount: item.box_count || 1,
          itemCount: item.quantity || 1,
          rejectKey: key,
          depth: 0,
          isExpandable: false,
        });
      });
    }

    // 3. Fallback: slip payload carried no lines → show the scanned QSeal units
    if (next.length === 0) {
      linkedUnitsParents.forEach((parent) => {
        const units = parent.linked_units || [];
        const parentKey = `slip-parent||${parent.id}`;

        next.push({
          key: parentKey,
          type: 'qseal-parent',
          productName: units[0]?.product_name || parent.name,
          sku: units[0]?.product_sku || '-',
          batchNumber: units[0]?.dispatch_batch || '-',
          boxCount: 1,
          itemCount: units.length,
          rejectKey: parentKey,
          depth: 0,
          isExpandable: units.length > 0,
        });

        units.forEach((unit) => {
          const childKey = `slip-child||${unit.id}`;
          next.push({
            key: childKey,
            type: 'qseal-child',
            productName: unit.serial_number,
            sku: unit.product_sku || '-',
            batchNumber: unit.serial_number || unit.dispatch_batch || '-',
            boxCount: 1,
            itemCount: 1,
            rejectKey: childKey,
            parentKey,
            depth: 1,
            isExpandable: false,
          });
        });
      });
    }

    return next;
  }, [slip, linkedUnitsParents]);

  // Parents holding child units start expanded so the whole slip is visible.
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(rows.filter((row) => row.isExpandable).map((row) => row.key))
  );

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

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) => row.depth === 0 || (row.parentKey && expandedParents.has(row.parentKey))
      ),
    [rows, expandedParents]
  );

  const childCount = rows.filter((row) => row.depth > 0).length;
  const itemCount = childCount > 0 ? childCount : rows.length;

  return (
    <ScreenContainer
      title="Receiving Slip"
      subtitle="Slip generated successfully"
      scrollable
      showHomeButton={false}
      contentContainerStyle={styles.resultContent}
    >
      <View style={styles.successBanner}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successText}>Receiving Slip Created</Text>
        <Text style={styles.slipNumber}>{slip.slip_number}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{slip.status}</Text>
        </View>
        {slip.asn_order_no && (
          <Text style={styles.slipAsnRef}>📋 {slip.asn_order_no}</Text>
        )}
      </View>

      {/* Primary action — sits directly under the confirmation box */}
      <TouchableOpacity style={styles.newSessionButton} onPress={onNewSession}>
        <Text style={styles.newSessionText}>Start New Session</Text>
      </TouchableOpacity>

      {/* Slip contents rendered with the inbound summary table */}
      <Text style={styles.tableSectionTitle}>Slip Items ({itemCount})</Text>
      <SummaryTable
        rows={visibleRows}
        expandedParents={expandedParents}
        isRejected={() => false}
        onToggleExpand={toggleExpand}
        onReject={() => {}}
        onUnreject={() => {}}
        onRemoveParent={() => {}}
        readOnly
      />

      {/* Info note */}
      <View style={styles.infoNote}>
        <Text style={styles.infoNoteText}>
          ℹ️ Items are in float mode. Use the{' '}
          <Text style={styles.infoNoteHighlight}>Assign Bin</Text> tab
          to map items to bin locations.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  resultContent: {
    paddingBottom: 40,
  },
  successBanner: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#1A2332',
    marginHorizontal: 24,
    marginTop: 24,
    borderRadius: 16,
  },
  successIcon: {
    fontSize: 48,
  },
  successText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  slipNumber: {
    color: '#1A73E8',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  statusBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  slipAsnRef: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  tableSectionTitle: {
    color: '#8899AA',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: 24,
    marginTop: 24,
  },
  infoNote: {
    backgroundColor: 'rgba(26,115,232,0.1)',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(26,115,232,0.25)',
  },
  infoNoteText: {
    color: '#8899AA',
    fontSize: 13,
    lineHeight: 20,
  },
  infoNoteHighlight: {
    color: '#1A73E8',
    fontWeight: '600',
  },
  newSessionButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 20,
  },
  newSessionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

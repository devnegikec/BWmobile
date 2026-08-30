// ============================================================
// SlipGeneratedView — Success state after slip generation
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import LinkedUnitsTable from '@/components/inbound/LinkedUnitsTable';
import type { ReceivingSlip, QSealParentWithUnits } from '@/types';

interface Props {
  slip: ReceivingSlip;
  linkedUnitsParents: QSealParentWithUnits[];
  onNewSession: () => void;
}

export default function SlipGeneratedView({ slip, linkedUnitsParents, onNewSession }: Props) {
  // The API returns either the newer grouped format (`groups`) or the
  // legacy flat format (`items`). Normalize both into a single list so
  // the success screen shows item rows regardless of response shape.
  const slipItems = slip.groups?.length
    ? slip.groups.flatMap((group) => group.items)
    : (slip.items ?? []);

  return (
    <ScreenContainer
      title="Receiving Slip"
      subtitle="Slip generated successfully"
      scrollable
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

      {/* Slip Items */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionCardTitle}>Items ({slipItems.length})</Text>
        {slipItems.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemSku}>{item.sku}</Text>
              <Text style={styles.itemBatch}>{item.batch_number}</Text>
            </View>
            <View style={styles.itemQty}>
              <Text style={styles.itemQtyText}>{item.quantity} × {item.box_count} boxes</Text>
            </View>
          </View>
        ))}
      </View>

      {/* QSeal Linked Units */}
      {linkedUnitsParents?.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>🔗 Linked Units</Text>
          <LinkedUnitsTable parents={linkedUnitsParents} />
        </View>
      )}

      {/* Info note */}
      <View style={styles.infoNote}>
        <Text style={styles.infoNoteText}>
          ℹ️ Items are in float mode. Use the{' '}
          <Text style={styles.infoNoteHighlight}>Assign Bin</Text> tab
          to map items to bin locations.
        </Text>
      </View>

      {/* New Session Button */}
      <TouchableOpacity style={styles.newSessionButton} onPress={onNewSession}>
        <Text style={styles.newSessionText}>Start New Session</Text>
      </TouchableOpacity>
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
  sectionCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 24,
    marginTop: 20,
  },
  sectionCardTitle: {
    color: '#8899AA',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  itemInfo: {},
  itemSku: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  itemBatch: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },
  itemQty: {},
  itemQtyText: {
    color: '#B0C4D8',
    fontSize: 14,
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
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 20,
  },
  newSessionText: {
    color: '#8899AA',
    fontSize: 16,
  },
});

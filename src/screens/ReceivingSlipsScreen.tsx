// ============================================================
// Receiving Slips Screen — List and manage receiving slips
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as inboundService from '../api/inboundService';
import * as putawayService from '../api/putawayService';
import type { ReceivingSlip, PutAwayList } from '../types';

export default function ReceivingSlipsScreen({ navigation }: any) {
  const { selectedWarehouse, worker } = useAuthStore();

  const [slips, setSlips] = useState<ReceivingSlip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // ---------- Load Slips ----------
  const loadSlips = useCallback(async () => {
    if (!selectedWarehouse) return;
    try {
      const response = await inboundService.getReceivingSlips({
        warehouse_id: selectedWarehouse.id,
        page_size: 50,
      });
      setSlips(response.receiving_slips || []);
    } catch (err: any) {
      console.error('Failed to load slips:', err);
    }
  }, [selectedWarehouse]);

  useEffect(() => {
    loadSlips();
  }, [loadSlips]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSlips();
    setRefreshing(false);
  };

  // ---------- Approve Slip ----------
  const handleApprove = (slip: ReceivingSlip) => {
    Alert.alert(
      'Approve Slip',
      `Approve ${slip.slip_number}? This will trigger put-away list generation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              const workerId = worker?.id;
              await inboundService.approveReceivingSlip(slip.id, workerId);
              Alert.alert('Approved', 'Receiving slip approved.');
              loadSlips();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail || 'Failed to approve.');
            }
          },
        },
      ]
    );
  };

  // ---------- Generate Put-Away ----------
  const handleGeneratePutaway = (slip: ReceivingSlip) => {
    Alert.alert(
      'Generate Put-Away',
      `Generate put-away list from ${slip.slip_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGeneratingId(slip.id);
            try {
              const workerId = worker?.id;
              const putaway = await putawayService.generatePutAwayFromSlip(slip.id, workerId);
              Alert.alert(
                'Success',
                `Put-away list ${putaway.put_away_list_no} created with ${putaway.items.length} items.`
              );
              loadSlips();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail || 'Failed to generate.');
            } finally {
              setGeneratingId(null);
            }
          },
        },
      ]
    );
  };

  // ---------- Status Chip Style ----------
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'pending_review':
        return { bg: '#F59E0B', text: 'Pending Review' };
      case 'pending_putaway':
        return { bg: '#3B82F6', text: 'Pending Put-Away' };
      case 'putaway_complete':
        return { bg: '#10B981', text: 'Put-Away Done' };
      case 'rejected':
        return { bg: '#EF4444', text: 'Rejected' };
      default:
        return { bg: '#6B7280', text: status };
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Receiving Slips</Text>
        <Text style={styles.headerSubtitle}>
          {selectedWarehouse?.name || ''} · {slips.length} slips
        </Text>
      </View>

      <FlatList
        data={slips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A73E8" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No receiving slips</Text>
            <Text style={styles.emptySubtext}>
              Start an inbound session to create receiving slips.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = getStatusStyle(item.status);
          return (
            <View style={styles.slipCard}>
              <View style={styles.slipHeader}>
                <Text style={styles.slipNumber}>{item.slip_number}</Text>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={styles.statusBadgeText}>{status.text}</Text>
                </View>
              </View>

              <Text style={styles.slipDate}>
                Created: {new Date(item.created_at).toLocaleString()}
              </Text>
              {item.asn_order_no && (
                <Text style={styles.slipAsnRef}>📋 {item.asn_order_no}</Text>
              )}
              <Text style={styles.slipItems}>
                {item.items?.length || 0} item(s)
              </Text>

              {/* Actions */}
              <View style={styles.slipActions}>
                {item.status === 'pending_review' && (
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => handleApprove(item)}
                  >
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'pending_putaway' && (
                  <TouchableOpacity
                    style={styles.putawayButton}
                    onPress={() => handleGeneratePutaway(item)}
                    disabled={generatingId === item.id}
                  >
                    {generatingId === item.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.putawayButtonText}>Generate Put-Away</Text>
                    )}
                  </TouchableOpacity>
                )}

                {item.status === 'putaway_complete' && (
                  <View style={styles.doneIndicator}>
                    <Text style={styles.doneIndicatorText}>✅ Complete</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#1A2332',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSubtitle: { color: '#8899AA', fontSize: 14, marginTop: 4 },

  listContent: { padding: 24, paddingBottom: 40 },
  slipCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  slipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  slipNumber: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  slipDate: { color: '#8899AA', fontSize: 12, marginBottom: 4 },
  slipAsnRef: { color: '#60A5FA', fontSize: 12, marginBottom: 4 },
  slipItems: { color: '#B0C4D8', fontSize: 13 },

  slipActions: { marginTop: 14 },
  approveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  approveButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  putawayButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  putawayButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  doneIndicator: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  doneIndicatorText: { color: '#10B981', fontSize: 14, fontWeight: '500' },

  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#8899AA', fontSize: 18, fontWeight: '600' },
  emptySubtext: { color: '#667788', fontSize: 14, marginTop: 8, textAlign: 'center' },
});

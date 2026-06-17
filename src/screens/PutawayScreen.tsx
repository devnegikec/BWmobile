// ============================================================
// Put-Away Screen — List and process put-away tasks
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as putawayService from '../api/putawayService';
import type { PutAwayList, PutAwayItem } from '../types';

type ViewMode = 'list' | 'detail';

export default function PutawayScreen() {
  const { selectedWarehouse, worker } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [lists, setLists] = useState<PutAwayList[]>([]);
  const [selectedList, setSelectedList] = useState<PutAwayList | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------- Load Put-Away Lists ----------
  const loadLists = useCallback(async () => {
    if (!selectedWarehouse) return;
    setError(null);
    try {
      const response = await putawayService.getPutAwayLists({
        warehouse_id: selectedWarehouse.id,
        status: 'pending',
        page_size: 50,
      });
      setLists(response.put_away_lists || []);
    } catch (err: any) {
      setError('Failed to load put-away lists.');
    }
  }, [selectedWarehouse]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLists();
    setRefreshing(false);
  };

  // ---------- Load Detail ----------
  const handleSelectList = async (list: PutAwayList) => {
    setIsLoading(true);
    try {
      const detail = await putawayService.getPutAwayList(list.id);
      setSelectedList(detail);
      setViewMode('detail');
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load put-away details.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Complete Item ----------
  const handleCompleteItem = (item: PutAwayItem) => {
    if (!selectedList) return;
    Alert.alert(
      'Confirm Put-Away',
      `Put ${item.sku} (${item.quantity}) into bin ${item.bin_location_code}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setCompletingId(item.id);
            try {
              const updated = await putawayService.completePutAwayItem(
                selectedList.id,
                item.id
              );
              // Update local state
              setSelectedList((prev) => {
                if (!prev) return null;
                const newItems = prev.items.map((i) =>
                  i.id === item.id ? { ...i, status: 'completed' as const, completed_at: updated.completed_at } : i
                );
                const allDone = newItems.every((i) => i.status === 'completed');
                return {
                  ...prev,
                  items: newItems,
                  status: allDone ? 'completed' as const : prev.status,
                };
              });
              Alert.alert('Done', `Item ${item.sku} put away successfully.`);
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail || 'Failed to complete.');
            } finally {
              setCompletingId(null);
            }
          },
        },
      ]
    );
  };

  // ---------- Skip Item ----------
  const handleSkipItem = (item: PutAwayItem) => {
    if (!selectedList) return;
    Alert.prompt
      ? Alert.prompt(
          'Skip Item',
          'Enter reason for skipping:',
          async (reason) => {
            try {
              await putawayService.skipPutAwayItem(selectedList.id, item.id, reason || undefined);
              setSelectedList((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  items: prev.items.map((i) =>
                    i.id === item.id ? { ...i, status: 'skipped' as const } : i
                  ),
                };
              });
            } catch (err: any) {
              Alert.alert('Error', 'Failed to skip item.');
            }
          },
          'plain-text',
          'Bin full'
        )
      : Alert.alert(
          'Skip Item',
          'Are you sure you want to skip this item?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Skip',
              style: 'destructive',
              onPress: async () => {
                try {
                  await putawayService.skipPutAwayItem(selectedList.id, item.id, 'Skipped by worker');
                  setSelectedList((prev) => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      items: prev.items.map((i) =>
                        i.id === item.id ? { ...i, status: 'skipped' as const } : i
                      ),
                    };
                  });
                } catch (err: any) {
                  Alert.alert('Error', 'Failed to skip item.');
                }
              },
            },
          ]
        );
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedList(null);
    loadLists(); // Refresh
  };

  // ============ RENDER: LIST VIEW ============
  if (viewMode === 'list') {
    const pendingCount = lists.filter((l) => l.status === 'pending').length;

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Put-Away Lists</Text>
          <Text style={styles.headerSubtitle}>
            {pendingCount} pending · {selectedWarehouse?.name || ''}
          </Text>
        </View>

        <FlatList
          data={lists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A73E8" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No put-away lists</Text>
              <Text style={styles.emptySubtext}>
                Generate a put-away list from a receiving slip.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const completed = item.completed_items ?? item.items?.filter((i: any) => i.status === 'completed').length ?? 0;
            const total = item.total_items ?? item.items?.length ?? 0;
            const progress = total > 0 ? completed / total : 0;

            return (
              <TouchableOpacity
                style={[styles.listCard, item.status === 'completed' && styles.listCardCompleted]}
                onPress={() => handleSelectList(item)}
              >
                <View style={styles.listCardHeader}>
                  <Text style={styles.listNo}>{item.put_away_list_no}</Text>
                  <View
                    style={[
                      styles.listStatus,
                      item.status === 'completed' ? styles.listStatusDone : styles.listStatusPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.listStatusText,
                        item.status === 'completed'
                          ? styles.listStatusTextDone
                          : styles.listStatusTextPending,
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBar}>
                  <View
                    style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                  />
                </View>

                <Text style={styles.listDetail}>
                  {completed}/{total} items completed
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  }

  // ============ RENDER: DETAIL VIEW ============
  if (viewMode === 'detail' && selectedList) {
    const completedCount = selectedList.items.filter((i) => i.status === 'completed').length;
    const allDone = completedCount === selectedList.items.length;

    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackToList}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedList.put_away_list_no}</Text>
          <Text style={styles.headerSubtitle}>
            {completedCount}/{selectedList.items.length} done
            {allDone && ' · ✅ COMPLETE'}
          </Text>
        </View>

        {/* Warnings */}
        {selectedList.warnings && selectedList.warnings.length > 0 && (
          <View style={styles.warningBanner}>
            {selectedList.warnings.map((w, i) => (
              <Text key={i} style={styles.warningBannerText}>⚠️ {w}</Text>
            ))}
          </View>
        )}

        {/* Items */}
        <FlatList
          data={selectedList.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.detailContent}
          renderItem={({ item }) => (
            <View
              style={[
                styles.itemCard,
                item.status === 'completed' && styles.itemCardDone,
                item.status === 'skipped' && styles.itemCardSkipped,
              ]}
            >
              <View style={styles.itemHeader}>
                <View>
                  <Text style={styles.itemSku}>{item.sku}</Text>
                  <Text style={styles.itemBatch}>Batch: {item.batch_number}</Text>
                </View>
                <View
                  style={[
                    styles.itemStatusBadge,
                    item.status === 'completed' && styles.itemStatusDone,
                    item.status === 'skipped' && styles.itemStatusSkipped,
                  ]}
                >
                  <Text style={styles.itemStatusText}>{item.status}</Text>
                </View>
              </View>

              <View style={styles.itemDetails}>
                <View style={styles.itemDetailRow}>
                  <Text style={styles.itemDetailLabel}>Qty:</Text>
                  <Text style={styles.itemDetailValue}>{item.quantity}</Text>
                </View>
                <View style={styles.itemDetailRow}>
                  <Text style={styles.itemDetailLabel}>Bin:</Text>
                  <Text style={styles.itemBinCode}>{item.bin_location_code}</Text>
                </View>
                <View style={styles.itemDetailRow}>
                  <Text style={styles.itemDetailLabel}>Order:</Text>
                  <Text style={styles.itemDetailValue}>#{item.sort_order}</Text>
                </View>
              </View>

              {/* Action buttons */}
              {item.status === 'pending' && (
                <View style={styles.itemActions}>
                  <TouchableOpacity
                    style={styles.completeButton}
                    onPress={() => handleCompleteItem(item)}
                    disabled={completingId === item.id}
                  >
                    {completingId === item.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.completeButtonText}>✓ Put Away</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.skipButton}
                    onPress={() => handleSkipItem(item)}
                  >
                    <Text style={styles.skipButtonText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              )}

              {item.status === 'completed' && item.completed_at && (
                <Text style={styles.completedAt}>
                  Completed: {new Date(item.completed_at).toLocaleString()}
                </Text>
              )}
            </View>
          )}
        />

        {/* All done state */}
        {allDone && (
          <View style={styles.allDoneBanner}>
            <Text style={styles.allDoneText}>
              🎉 All items put away! This list is complete and has been synced to the backend.
            </Text>
          </View>
        )}
      </View>
    );
  }

  return null;
}

// ============ STYLES ============

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#1A2332',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 8 },
  headerSubtitle: { color: '#8899AA', fontSize: 14, marginTop: 4 },
  backButton: { color: '#1A73E8', fontSize: 16, fontWeight: '600' },

  // List
  listContent: { padding: 24, paddingBottom: 40 },
  listCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  listCardCompleted: { opacity: 0.6 },
  listCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listNo: { color: '#fff', fontSize: 18, fontWeight: '700' },
  listStatus: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  listStatusPending: { backgroundColor: '#F59E0B' },
  listStatusDone: { backgroundColor: '#10B981' },
  listStatusText: { fontSize: 12, fontWeight: '600' },
  listStatusTextPending: { color: '#fff' },
  listStatusTextDone: { color: '#fff' },
  progressBar: {
    height: 6,
    backgroundColor: '#2A3A4A',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#1A73E8',
    borderRadius: 3,
  },
  listDetail: { color: '#8899AA', fontSize: 13 },

  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#8899AA', fontSize: 18, fontWeight: '600' },
  emptySubtext: { color: '#667788', fontSize: 14, marginTop: 8, textAlign: 'center' },

  // Warning
  warningBanner: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    padding: 14,
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 10,
  },
  warningBannerText: { color: '#F59E0B', fontSize: 13 },

  // Detail
  detailContent: { padding: 24, paddingBottom: 40 },
  itemCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  itemCardDone: { borderColor: '#10B981', opacity: 0.7 },
  itemCardSkipped: { borderColor: '#EF4444', opacity: 0.6 },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemSku: { color: '#fff', fontSize: 17, fontWeight: '700' },
  itemBatch: { color: '#8899AA', fontSize: 12, marginTop: 2 },
  itemStatusBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  itemStatusDone: { backgroundColor: '#10B981' },
  itemStatusSkipped: { backgroundColor: '#EF4444' },
  itemStatusText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  itemDetails: { marginTop: 14, gap: 8 },
  itemDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetailLabel: { color: '#667788', fontSize: 13, width: 50 },
  itemDetailValue: { color: '#B0C4D8', fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
  itemBinCode: { color: '#1A73E8', fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' },

  itemActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  completeButton: {
    flex: 2,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completeButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  skipButton: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: { color: '#9CA3AF', fontSize: 15, fontWeight: '500' },
  completedAt: { color: '#10B981', fontSize: 11, marginTop: 8 },

  allDoneBanner: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    padding: 20,
    marginHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  allDoneText: { color: '#10B981', fontSize: 15, textAlign: 'center', fontWeight: '500' },
});

// ============================================================
// Put-Away Screen — List and process put-away tasks
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
  Modal,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import * as putawayService from '../api/putawayService';
import QrScanner from '../components/QrScanner';
import ScreenContainer from '../components/ScreenContainer';
import type { PutAwayList, PutAwayItem } from '../types';
import type { RootStackParamList } from '../navigation/AppNavigator';

type ViewMode = 'list' | 'detail';

export default function PutawayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { selectedWarehouse, worker } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [lists, setLists] = useState<PutAwayList[]>([]);
  const [selectedList, setSelectedList] = useState<PutAwayList | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // QR scanning states
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanMode, setScanMode] = useState<'item' | 'bin'>('item');
  const [scannedItem, setScannedItem] = useState<PutAwayItem | null>(null);
  const [overrideBinId, setOverrideBinId] = useState<string | null>(null);

  // Skip reason input
  const [skipModalVisible, setSkipModalVisible] = useState(false);
  const [skipTarget, setSkipTarget] = useState<PutAwayItem | null>(null);
  const [skipReason, setSkipReason] = useState('');

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

    const doComplete = async (binIdOverride?: string) => {
      setCompletingId(item.id);
      try {
        const updated = await putawayService.completePutAwayItem(
          selectedList.id,
          item.id,
          binIdOverride
        );
        setSelectedList((prev) => {
          if (!prev) return null;
          const newItems = prev.items.map((i) =>
            i.id === item.id
              ? { ...i, status: 'completed' as const, completed_at: updated.completed_at, bin_location_code: binIdOverride ? 'Scanned Bin' : i.bin_location_code }
              : i
          );
          const allDone = newItems.every((i) => i.status === 'completed' || i.status === 'skipped');
          return {
            ...prev,
            items: newItems,
            completed_items: prev.completed_items + 1,
            status: allDone ? ('completed' as const) : prev.status,
          };
        });
        setOverrideBinId(null);
        Alert.alert('Done', `Item ${item.sku} put away successfully.`);
      } catch (err: any) {
        Alert.alert('Error', err.response?.data?.detail || 'Failed to complete.');
      } finally {
        setCompletingId(null);
      }
    };

    Alert.alert(
      'Confirm Put-Away',
      `Put ${item.item_name || item.sku} (Qty: ${item.quantity}) into ${item.bin_full_path || item.bin_location_code}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Scan Different Bin',
          onPress: () => {
            setScannedItem(item);
            setScanMode('bin');
            setScannerVisible(true);
          },
        },
        { text: 'Confirm', onPress: () => doComplete(overrideBinId ?? undefined) },
      ]
    );
  };

  // ---------- Handle QR Scan Result ----------
  const handleQRScan = (data: string) => {
    setScannerVisible(false);
    if (scanMode === 'bin') {
      // Bin QR scanned — use as override
      setOverrideBinId(data);
      if (scannedItem) {
        const item = scannedItem;
        Alert.alert(
          'Bin Scanned',
          `Bin: ${data}\n\nComplete put-away for ${item.item_name || item.sku}?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setOverrideBinId(null) },
            {
              text: 'Confirm',
              onPress: async () => {
                if (!selectedList) return;
                setCompletingId(item.id);
                try {
                  await putawayService.completePutAwayItem(selectedList.id, item.id, data);
                  setSelectedList((prev) => {
                    if (!prev) return null;
                    const newItems = prev.items.map((i) =>
                      i.id === item.id
                        ? { ...i, status: 'completed' as const, completed_at: new Date().toISOString(), bin_location_code: data }
                        : i
                    );
                    const allDone = newItems.every((i) => i.status === 'completed' || i.status === 'skipped');
                    return {
                      ...prev,
                      items: newItems,
                      completed_items: prev.completed_items + 1,
                      status: allDone ? ('completed' as const) : prev.status,
                    };
                  });
                  Alert.alert('Done', `Item put away into bin ${data}.`);
                } catch (err: any) {
                  Alert.alert('Error', err.response?.data?.detail || 'Failed to complete.');
                } finally {
                  setCompletingId(null);
                  setOverrideBinId(null);
                  setScannedItem(null);
                }
              },
            },
          ]
        );
      }
    }
    // item scan mode — could be used to verify item QR in the future
  };

  // ---------- Skip Item ----------
  const handleSkipItem = (item: PutAwayItem) => {
    setSkipTarget(item);
    setSkipReason('');
    setSkipModalVisible(true);
  };

  const confirmSkip = async () => {
    if (!selectedList || !skipTarget) return;
    const reason = skipReason.trim() || 'Skipped by worker';
    try {
      await putawayService.skipPutAwayItem(selectedList.id, skipTarget.id, reason);
      setSelectedList((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === skipTarget.id ? { ...i, status: 'skipped' as const } : i
          ),
        };
      });
    } catch (err: any) {
      Alert.alert('Error', 'Failed to skip item.');
    } finally {
      setSkipModalVisible(false);
      setSkipTarget(null);
      setSkipReason('');
    }
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
      <ScreenContainer
        title="Put-Away Lists"
        subtitle={`${pendingCount} pending · ${selectedWarehouse?.name || ''}`}
      >
        {/* Direct Put-Away button */}
        <TouchableOpacity
          style={styles.directPutawayButton}
          onPress={() => navigation.navigate('DirectPutaway')}
        >
          <Text style={styles.directPutawayIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.directPutawayTitle}>Start Direct Put-Away</Text>
            <Text style={styles.directPutawaySubtitle}>
              Scan items & assign bins manually (no pre-generated list needed)
            </Text>
          </View>
          <Text style={styles.directPutawayArrow}>→</Text>
        </TouchableOpacity>

        <FlatList
          style={{ flex: 1 }}
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
            const completed = item.completed_items ?? 0;
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
      </ScreenContainer>
    );
  }

  // ============ RENDER: DETAIL VIEW ============
  if (viewMode === 'detail' && selectedList) {
    const completedCount = selectedList.completed_items ?? selectedList.items.filter((i) => i.status === 'completed').length;
    const allDone = completedCount === selectedList.items.length;

    return (
      <>
        {/* Skip reason modal */}
        <Modal visible={skipModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Skip Item</Text>
              <Text style={styles.modalSubtitle}>
                {skipTarget ? `${skipTarget.item_name || skipTarget.sku} — ${skipTarget.bin_full_path || skipTarget.bin_location_code}` : ''}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter reason (e.g., Bin full, Damaged)"
                placeholderTextColor="#667788"
                value={skipReason}
                onChangeText={setSkipReason}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => { setSkipModalVisible(false); setSkipTarget(null); }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirmButton} onPress={confirmSkip}>
                  <Text style={styles.modalConfirmText}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <ScreenContainer
          title={selectedList.put_away_list_no}
          subtitle={`${completedCount}/${selectedList.items.length} done${allDone ? ' · ✅ COMPLETE' : ''}`}
          onBack={handleBackToList}
        >
          {/* Progress bar */}
          <View style={styles.detailProgressBarWrap}>
            <View style={styles.detailProgressBar}>
              <View style={[styles.detailProgressFill, { width: `${selectedList.items.length > 0 ? Math.round((completedCount / selectedList.items.length) * 100) : 0}%` }]} />
            </View>
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
          style={{ flex: 1 }}
          data={selectedList.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.detailContent}
          renderItem={({ item, index }) => {
            const isCurrent = item.status === 'pending' && index === selectedList.items.findIndex(i => i.status === 'pending');
            return (
            <View
              style={[
                styles.itemCard,
                item.status === 'completed' && styles.itemCardDone,
                item.status === 'skipped' && styles.itemCardSkipped,
                isCurrent && styles.itemCardCurrent,
              ]}
            >
              {/* Route indicator */}
              <View style={styles.routeRow}>
                <View style={[styles.routeBadge, item.status === 'completed' && styles.routeBadgeDone, item.status === 'skipped' && styles.routeBadgeSkipped]}>
                  <Text style={styles.routeBadgeText}>
                    {item.status === 'completed' ? '✓' : item.status === 'skipped' ? '✗' : `#${item.sort_order}`}
                  </Text>
                </View>
                <Text style={styles.routeLabel}>
                  {item.status === 'completed' ? 'Done' : item.status === 'skipped' ? 'Skipped' : isCurrent ? '← NEXT STOP' : 'Upcoming'}
                </Text>
              </View>

              <View style={styles.itemHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemSku}>{item.item_name || item.sku}</Text>
                  {item.item_name && <Text style={styles.itemSkuSub}>{item.sku}</Text>}
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
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.itemBinCode}>{item.bin_full_path || item.bin_location_code}</Text>
                  </View>
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
                    style={styles.scanBinButton}
                    onPress={() => {
                      setScannedItem(item);
                      setScanMode('bin');
                      setScannerVisible(true);
                    }}
                  >
                    <Text style={styles.scanBinButtonText}>📷 Bin</Text>
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
              {item.status === 'skipped' && item.notes && (
                <Text style={styles.skippedReason}>Reason: {item.notes}</Text>
              )}
            </View>
          );
          }}
        />

        {/* All done state */}
        {allDone && (
          <View style={styles.allDoneBanner}>
            <Text style={styles.allDoneText}>
              🎉 All items put away! This list is complete and has been synced to the backend.
            </Text>
          </View>
        )}
        </ScreenContainer>

        {/* QR Scanner overlay (full-screen, on top) */}
        {scannerVisible && (
          <View style={StyleSheet.absoluteFill}>
            <QrScanner
              onScan={handleQRScan}
              onClose={() => { setScannerVisible(false); setScannedItem(null); }}
              title={scanMode === 'bin' ? 'Scan Bin QR' : 'Scan Item QR'}
              subtitle={scanMode === 'bin' ? 'Scan the bin location QR code' : 'Scan item to confirm'}
            />
          </View>
        )}
      </>
    );
  }

  return null;
}

// ============ STYLES ============

const styles = StyleSheet.create({
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

  // Route / walking order
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  routeBadge: {
    backgroundColor: '#1A73E8',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBadgeDone: { backgroundColor: '#10B981' },
  routeBadgeSkipped: { backgroundColor: '#EF4444' },
  routeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  routeLabel: { color: '#8899AA', fontSize: 12, fontWeight: '600' },
  itemCardCurrent: { borderColor: '#1A73E8', borderWidth: 2 },
  itemSkuSub: { color: '#667788', fontSize: 12, marginTop: 1 },

  // Detail progress bar
  detailProgressBarWrap: { paddingHorizontal: 24, marginTop: 12, marginBottom: 4 },
  detailProgressBar: { height: 6, backgroundColor: '#2A3A4A', borderRadius: 3 },
  detailProgressFill: { height: 6, backgroundColor: '#1A73E8', borderRadius: 3 },

  // Direct Put-Away button
  directPutawayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2A4A6C',
  },
  directPutawayIcon: { fontSize: 28 },
  directPutawayTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  directPutawaySubtitle: { color: '#60A5FA', fontSize: 12, marginTop: 2 },
  directPutawayArrow: { color: '#60A5FA', fontSize: 22, fontWeight: '700' },

  // Scan bin button
  scanBinButton: {
    flex: 1,
    backgroundColor: '#1A3A5C',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanBinButtonText: { color: '#60A5FA', fontSize: 14, fontWeight: '500' },

  // Skip reason
  skippedReason: { color: '#EF4444', fontSize: 11, marginTop: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1A2332',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalSubtitle: { color: '#8899AA', fontSize: 14, marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0F1923',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    color: '#fff',
    fontSize: 14,
    padding: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { color: '#9CA3AF', fontSize: 15, fontWeight: '500' },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

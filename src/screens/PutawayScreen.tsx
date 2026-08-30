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
import { useAuthStore } from '@/store/authStore';
import * as putawayService from '@/api/putawayService';
import AssignView from '@/components/putaway/AssignView';
import type { BinInfo } from '@/components/putaway/binScanner';
import type { PutAwayList, PutAwayItem } from '@/types';
import type { RootStackParamList } from '@/navigation/AppNavigator';

type ViewMode = 'list' | 'detail';

interface PutAwayGroup {
  key: string;
  name: string;
  sku: string;
  children: PutAwayItem[];
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSpacer} />
      )}
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export default function PutawayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { selectedWarehouse } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [lists, setLists] = useState<PutAwayList[]>([]);
  const [selectedList, setSelectedList] = useState<PutAwayList | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [assigningAll, setAssigningAll] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
    } catch {
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
    if (isLoading) return;
    setIsLoading(true);
    try {
      const detail = await putawayService.getPutAwayList(list.id);
      setSelectedList(detail);
      setViewMode('detail');
    } catch {
      Alert.alert('Error', 'Failed to load put-away details.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Mark items completed in local state ----------
  const markItemsCompleted = (completedIds: string[], binLabel: string) => {
    setSelectedList((prev) => {
      if (!prev) return null;
      const newItems = prev.items.map((i) =>
        completedIds.includes(i.id)
          ? { ...i, status: 'completed' as const, completed_at: new Date().toISOString(), bin_location_code: binLabel, bin_full_path: binLabel }
          : i
      );
      const doneCount = newItems.filter((i) => i.status === 'completed').length;
      const pendingCount = newItems.filter((i) => i.status === 'pending').length;
      const allDone = newItems.every((i) => i.status === 'completed' || i.status === 'skipped');
      return {
        ...prev,
        items: newItems,
        completed_items: doneCount,
        pending_items: pendingCount,
        status: allDone ? ('completed' as const) : prev.status,
      };
    });
  };

  // ---------- Assign a single item ----------
  const handleAssignItem = async (item: PutAwayItem, bin: BinInfo) => {
    if (!selectedList) return;
    setCompletingId(item.id);
    try {
      await putawayService.completePutAwayItem(selectedList.id, item.id, bin.location_id);
      markItemsCompleted([item.id], bin.full_path || bin.location_code || bin.qr_code);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to complete.');
    } finally {
      setCompletingId(null);
    }
  };

  // ---------- Assign all pending items in a group ----------
  const handleAssignGroup = async (group: PutAwayGroup, bin: BinInfo) => {
    if (!selectedList) return;
    const pending = group.children.filter((c) => c.status === 'pending');
    if (pending.length === 0) return;
    setAssigningAll(true);
    const results = await Promise.allSettled(
      pending.map((item) =>
        putawayService.completePutAwayItem(selectedList.id, item.id, bin.location_id)
      )
    );
    const completedIds = pending
      .filter((_, i) => results[i].status === 'fulfilled')
      .map((item) => item.id);
    setAssigningAll(false);
    markItemsCompleted(completedIds, bin.full_path || bin.location_code || bin.qr_code);
  };

  // ---------- Assign all pending items ----------
  const handleAssignAll = async (locationId: string, binLabel: string) => {
    if (!selectedList) return;
    const pending = selectedList.items.filter((i) => i.status === 'pending');
    if (pending.length === 0) {
      Alert.alert('Info', 'No pending items.');
      return;
    }
    setAssigningAll(true);
    const results = await Promise.allSettled(
      pending.map((item) =>
        putawayService.completePutAwayItem(selectedList.id, item.id, locationId)
      )
    );
    const completedIds = pending
      .filter((_, i) => results[i].status === 'fulfilled')
      .map((item) => item.id);
    setAssigningAll(false);
    markItemsCompleted(completedIds, binLabel);
    Alert.alert('Done', `${completedIds.length}/${pending.length} items assigned.`);
  };

  // ---------- Toggle group expand ----------
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
    } catch {
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
      <View style={styles.container}>
        <Header title="Put-Away Lists" subtitle={`${pendingCount} pending · ${selectedWarehouse?.name || ''}`} />
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {isLoading && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color="#1A73E8" />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        )}
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
      </View>
    );
  }

  // ============ RENDER: DETAIL VIEW ============
  if (viewMode === 'detail' && selectedList) {
    const completedCount = selectedList.completed_items ?? selectedList.items.filter((i) => i.status === 'completed').length;
    const allDone = completedCount === selectedList.items.length;

    // Group items by product for a collapsible box → child table
    const groups: PutAwayGroup[] = [];
    const groupIndex = new Map<string, PutAwayGroup>();
    for (const item of selectedList.items) {
      const key = item.item_id || item.item_name || item.sku || item.id;
      let group = groupIndex.get(key);
      if (!group) {
        group = { key, name: item.item_name || item.sku, sku: item.sku, children: [] };
        groupIndex.set(key, group);
        groups.push(group);
      }
      group.children.push(item);
    }

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

        <AssignView
          title={selectedList.put_away_list_no}
          subtitle={`${completedCount}/${selectedList.items.length} done${allDone ? ' · ✅ COMPLETE' : ''}`}
          isAssigning={assigningAll}
          doneCount={completedCount}
          pendingCount={selectedList.items.filter((i) => i.status === 'pending').length}
          onAssignAll={(locationId, binLabel) => handleAssignAll(locationId, binLabel)}
          onBack={handleBackToList}
        >
          {(ctx) => (
            <View>
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

              {/* Table header */}
              <View style={styles.tableHeaders}>
                <Text style={[styles.tableHeader, styles.colProduct]}>Product / SKU</Text>
                <Text style={[styles.tableHeader, styles.colBatch]}>Batch</Text>
                <Text style={[styles.tableHeader, styles.colQty]}>Qty</Text>
                <Text style={[styles.tableHeader, styles.colAction]}>Action</Text>
              </View>

              {/* Grouped rows */}
              {groups.map((group) => {
            const pendingChildren = group.children.filter((c) => c.status === 'pending');
            const groupDone = group.children.every((c) => c.status === 'completed' || c.status === 'skipped');
            const expanded = expandedGroups.has(group.key);
            const totalQty = pendingChildren.reduce((sum, c) => sum + c.quantity, 0);
            return (
              <View key={group.key}>
                {/* Group (box) row */}
                <TouchableOpacity
                  style={styles.tableRow}
                  activeOpacity={0.7}
                  onPress={() => toggleGroup(group.key)}
                >
                  <View style={[styles.tableCell, styles.colProduct]}>
                    <Text style={styles.tableName} numberOfLines={1}>
                      {expanded ? '▼ ' : '▶ '}{group.name}
                    </Text>
                    <Text style={styles.tableSku} numberOfLines={1}>{group.sku}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colBatch]}>
                    <Text style={styles.tableBatch}>—</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colQty]}>
                    <Text style={styles.tableQty}>{totalQty}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colAction]}>
                    {groupDone ? (
                      <View style={[styles.badge, styles.badgeDone]}>
                        <Text style={styles.badgeText}>✓</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.assignBtn}
                        onPress={() => {
                          if (!ctx.bin) { Alert.alert('No Bin', 'Scan or enter a bin code first.'); return; }
                          handleAssignGroup(group, ctx.bin);
                        }}
                        disabled={assigningAll}
                      >
                        {assigningAll ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.assignBtnText}>Assign ({pendingChildren.length})</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Child rows */}
                {expanded &&
                  group.children.map((child) => {
                    const isDone = child.status === 'completed';
                    const isSkipped = child.status === 'skipped';
                    return (
                      <View
                        key={child.id}
                        style={[styles.tableRow, styles.tableRowChild, isDone && styles.tableRowDone, isSkipped && styles.tableRowSkipped]}
                      >
                        <View style={[styles.tableCell, styles.colProduct]}>
                          <Text style={styles.tableChildName} numberOfLines={1}>
                            {'   '}{child.batch_number || child.sku || group.name}
                          </Text>
                        </View>
                        <View style={[styles.tableCell, styles.colBatch]}>
                          <Text style={styles.tableBatch} numberOfLines={1}>{child.batch_number || '—'}</Text>
                        </View>
                        <View style={[styles.tableCell, styles.colQty]}>
                          <Text style={styles.tableQty}>{child.quantity}</Text>
                        </View>
                        <View style={[styles.tableCell, styles.colAction]}>
                          {isDone ? (
                            <View style={[styles.badge, styles.badgeDone]}>
                              <Text style={styles.badgeText}>✓</Text>
                            </View>
                          ) : isSkipped ? (
                            <View style={[styles.badge, styles.badgeSkipped]}>
                              <Text style={styles.badgeText}>✕</Text>
                            </View>
                          ) : (
                            <View style={styles.actionRow}>
                              <TouchableOpacity
                                style={styles.assignBtn}
                                onPress={() => {
                                  if (!ctx.bin) { Alert.alert('No Bin', 'Scan or enter a bin code first.'); return; }
                                  handleAssignItem(child, ctx.bin);
                                }}
                                disabled={completingId === child.id}
                              >
                                {completingId === child.id ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <Text style={styles.assignBtnText}>Assign</Text>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.skipBtnSmall}
                                onPress={() => handleSkipItem(child)}
                              >
                                <Text style={styles.skipBtnSmallText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
              </View>
            );
          })}

        {/* All done state */}
        {allDone && (
          <View style={styles.allDoneBanner}>
            <Text style={styles.allDoneText}>
              🎉 All items put away! This list is complete and has been synced to the backend.
            </Text>
          </View>
        )}
            </View>
          )}
        </AssignView>
      </>
    );
  }

  return null;
}

// ============ STYLES ============

const styles = StyleSheet.create({
  // Container + header (AssignView style)
  container: { flex: 1, backgroundColor: '#0F1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
  },
  backBtn: { padding: 6 },
  backIcon: { color: '#fff', fontSize: 28, lineHeight: 30 },
  headerSpacer: { width: 36 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff', textAlign: 'center' },
  headerSubtitle: { fontSize: 12, color: '#8899AA', marginTop: 2, textAlign: 'center' },

  // Table (AssignView-style)
  tableContent: { paddingHorizontal: 16, paddingBottom: 24 },
  tableHeaders: {
    flexDirection: 'row',
    backgroundColor: '#0F1923',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  tableHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  colProduct: { flex: 5, minWidth: 0 },
  colBatch: { flex: 2, minWidth: 0 },
  colQty: { width: 44, alignItems: 'center' as const },
  colAction: { width: 116, alignItems: 'flex-end' as const },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  tableRowDone: { opacity: 0.55, borderColor: '#10B981' },
  tableRowSkipped: { opacity: 0.55, borderColor: '#EF4444' },
  tableCell: { justifyContent: 'center' },
  tableRoute: { color: '#1A73E8', fontSize: 10, fontWeight: '700', marginRight: 4 },
  tableName: { color: '#E0E8F0', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  tableSku: { color: '#667788', fontSize: 10, marginTop: 1 },
  tableBin: { color: '#60A5FA', fontSize: 11, marginTop: 2 },
  tableMeta: { color: '#10B981', fontSize: 10, marginTop: 2 },
  tableBatch: { color: '#8899AA', fontSize: 11 },
  tableQty: { color: '#B0C4D8', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: '#10B981' },
  badgeSkipped: { backgroundColor: '#EF4444' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  completeIconBtn: { backgroundColor: '#10B981', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  completeIconText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scanIconBtn: { backgroundColor: '#1A3A5C', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scanIconText: { fontSize: 15 },
  skipIconBtn: { backgroundColor: '#374151', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  skipIconText: { color: '#9CA3AF', fontSize: 16, fontWeight: '700' },

  // Bin input + resolved row (AssignView-style)
  binRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1F2937', borderRadius: 12, margin: 16, marginTop: 0,
    padding: 4, paddingLeft: 12,
  },
  binInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cubeIcon: { marginRight: 6, fontSize: 16 },
  binInput: { flex: 1, fontSize: 16, color: '#F9FAFB', paddingVertical: 10 },
  scanBtn: { padding: 8 },
  scanIcon: { fontSize: 18 },
  goBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  goBtnDisabled: { backgroundColor: '#1E3A5F' },
  goBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  resolvingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 8 },
  resolvingText: { color: '#9CA3AF', fontSize: 14 },
  resolvedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#064E3B', borderRadius: 10, padding: 12,
  },
  resolvedInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  checkIcon: { fontSize: 16 },
  resolvedPath: { fontSize: 14, color: '#34D399', fontWeight: '500', flex: 1 },
  assignAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  btnDisabled: { opacity: 0.5 },
  assignIcon: { fontSize: 14 },
  assignAllText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Table child rows + assign buttons
  tableRowChild: { backgroundColor: '#0F1923' },
  tableChildName: { color: '#8899AA', fontSize: 12, fontFamily: 'monospace' },
  assignBtn: { backgroundColor: '#1A73E8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  assignBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  skipBtnSmall: { backgroundColor: '#374151', width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  skipBtnSmallText: { color: '#9CA3AF', fontSize: 14, fontWeight: '700' },

  // Scanner modal
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerCloseBtn: {
    position: 'absolute', top: 50, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8,
  },
  closeIcon: { color: '#fff', fontSize: 24, lineHeight: 26 },

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

  // Error / loading banners
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },
  loadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  loadingText: { color: '#8899AA', fontSize: 13 },

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

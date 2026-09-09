// ============================================================
// Put-Away Screen — List and process put-away tasks
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';
import * as putawayService from '@/api/putawayService';
import AssignView from '@/components/putaway/AssignView';
import PutawayHeader from '@/components/putaway/PutawayHeader';
import PutAwayListCard from '@/components/putaway/PutAwayListCard';
import SkipReasonModal from '@/components/putaway/SkipReasonModal';
import { styles } from '@/components/putaway/PutawayScreen.styles';
import type { BinInfo } from '@/components/putaway/binScanner';
import type { PutAwayList, PutAwayItem } from '@/types';

type ViewMode = 'list' | 'detail';

interface PutAwayGroup {
  key: string;
  name: string;
  sku: string;
  children: PutAwayItem[];
}

export default function PutawayScreen() {
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

  // ---------- Re-fetch authoritative state from the server ----------
  const refreshDetail = useCallback(async (listId: string) => {
    try {
      const detail = await putawayService.getPutAwayList(listId);
      setSelectedList(detail);
    } catch {
      // Keep the optimistic local state if the refresh fails.
    }
  }, []);

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
      const status = err.response?.status;
      Alert.alert(
        status === 409 ? 'Already Completed' : 'Error',
        status === 409
          ? 'This item was already put away. Refreshing…'
          : err.response?.data?.detail || 'Failed to complete.'
      );
    } finally {
      setCompletingId(null);
    }
    // Re-fetch so the UI converges on server state (e.g. retried items that
    // were already completed to a different bin).
    await refreshDetail(selectedList.id);
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
    await refreshDetail(selectedList.id);
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
    // Re-fetch authoritative state so the counts match the server even when
    // some requests were rejected transiently (mobile/web mismatch bug).
    await refreshDetail(selectedList.id);
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
        <PutawayHeader title="Put-Away Lists" subtitle={`${pendingCount} pending · ${selectedWarehouse?.name || ''}`} />
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
          renderItem={({ item }) => (
            <PutAwayListCard item={item} onPress={() => handleSelectList(item)} />
          )}
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
        <SkipReasonModal
          visible={skipModalVisible}
          target={skipTarget}
          reason={skipReason}
          onChangeReason={setSkipReason}
          onCancel={() => { setSkipModalVisible(false); setSkipTarget(null); }}
          onConfirm={confirmSkip}
        />

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



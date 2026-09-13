// ============================================================
// Put-Away Screen — List and process put-away tasks
// ============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import type { PutAwayList, PutAwayItem, PutAwayGroup as ApiPutAwayGroup } from '@/types';

type ViewMode = 'list' | 'detail';

interface PutAwayGroup {
  key: string;
  name: string;
  sku: string;
  children: PutAwayItem[];
}

/**
 * Convert one put-away group (a single put-away line / master pack) into the
 * flat `PutAwayItem` shape used by the complete/skip actions.
 */
function groupToItem(group: ApiPutAwayGroup): PutAwayItem {
  const children = Array.isArray(group.items) ? group.items : [];
  const first = children[0];
  const status: PutAwayItem['status'] =
    group.status === 'completed' || group.status === 'skipped'
      ? group.status
      : 'pending';
  return {
    id: group.id,
    item_id: group.item_id ?? group.id,
    sku: first?.sku ?? group.product_name ?? '-',
    item_name: group.product_name ?? first?.sku ?? undefined,
    batch_number: first?.batch_number ?? '-',
    serial_nos: children
      .map((c) => c.serial_number)
      .filter((s): s is string => Boolean(s)),
    quantity: children.reduce((sum, c) => sum + (c.quantity || 0), 0),
    bin_location_id: group.bin_location_id ?? '',
    bin_location_code: group.bin_location_code ?? '',
    bin_full_path: group.bin_location_code ?? undefined,
    sort_order: group.sort_order ?? 0,
    status,
  };
}

/** Quantity-based progress counts, derived from groups (new) or items (legacy). */
function computeCounts(
  list: PutAwayList
): { total: number; completed: number; pending: number } {
  const groups = list.groups;
  if (Array.isArray(groups) && groups.length > 0) {
    const groupQty = (g: ApiPutAwayGroup) =>
      (g.items ?? []).reduce((sum, c) => sum + (c.quantity || 0), 0);
    const total = groups.reduce((sum, g) => sum + groupQty(g), 0);
    const completed = groups
      .filter((g) => g.status === 'completed')
      .reduce((sum, g) => sum + groupQty(g), 0);
    const pending = groups
      .filter((g) => g.status !== 'completed' && g.status !== 'skipped')
      .reduce((sum, g) => sum + groupQty(g), 0);
    return { total, completed, pending };
  }
  const items = list.items ?? [];
  const total = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const completed = items
    .filter((i) => i.status === 'completed')
    .reduce((sum, i) => sum + (i.quantity || 0), 0);
  const pending = items
    .filter((i) => i.status === 'pending')
    .reduce((sum, i) => sum + (i.quantity || 0), 0);
  return { total, completed, pending };
}

/**
 * Normalize a put-away detail response into the flat `items` shape used by the
 * state actions (complete/skip), while keeping the raw `groups` for rendering.
 * New API responses carry `groups` (one group per put-away line / master pack);
 * older responses carry a flat `items` array.
 */
function normalizePutAwayList(list: PutAwayList): PutAwayList {
  let items: PutAwayItem[];
  if (Array.isArray(list.items) && list.items.length > 0) {
    // Prefer the flat items when the API provides them — each carries the real
    // put-away line id used by complete/skip.
    items = list.items;
  } else if (Array.isArray(list.groups) && list.groups.length > 0) {
    items = list.groups
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(groupToItem);
  } else {
    items = [];
  }
  return { ...list, items, warnings: list.warnings ?? [] };
}

/** Build legacy SKU-grouped rows for the flat `items` format. */
function buildLegacyDisplayGroups(items: PutAwayItem[]): PutAwayGroup[] {
  const groups: PutAwayGroup[] = [];
  const groupIndex = new Map<string, PutAwayGroup>();
  for (const item of items) {
    const key = item.item_id || item.item_name || item.sku || item.id;
    let group = groupIndex.get(key);
    if (!group) {
      group = { key, name: item.item_name || item.sku, sku: item.sku, children: [] };
      groupIndex.set(key, group);
      groups.push(group);
    }
    group.children.push(item);
  }
  return groups;
}

export default function PutawayScreen() {
  const { selectedWarehouse, user, worker } = useAuthStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [lists, setLists] = useState<PutAwayList[]>([]);
  const [selectedList, setSelectedList] = useState<PutAwayList | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // item_id → suggested bin label for manual-mode lines without an assigned bin
  const [suggestedBins, setSuggestedBins] = useState<Record<string, string>>({});
  const suggestRequestRef = useRef(0);

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

  // ---------- Suggested bins (manual mode) ----------
  // Put-away lists generated in manual mode have no bin_location_id on their
  // lines, so ask the smart location engine for the best bin per item.
  const loadSuggestedBins = useCallback(async (list: PutAwayList) => {
    const actorId = worker?.id || user?.id;
    if (!actorId || !list.warehouse_id) return;
    const requestId = ++suggestRequestRef.current;
    setSuggestedBins({});

    // Aggregate needed items by item_id so lines of the same item with
    // different batches are summed into one request.
    const neededMap = new Map<string, { item_id: string; quantity: number; batch_no: string | null }>();
    const addLine = (
      itemId: string | null | undefined,
      qty: number,
      batch: string | null | undefined,
      hasBin: boolean,
    ) => {
      if (!itemId || hasBin) return;
      const existing = neededMap.get(itemId);
      if (existing) {
        existing.quantity += qty || 0;
        if (!existing.batch_no) existing.batch_no = batch ?? null;
      } else {
        neededMap.set(itemId, {
          item_id: itemId,
          quantity: qty || 0,
          batch_no: batch ?? null,
        });
      }
    };

    const groups = list.groups ?? [];
    if (groups.length > 0) {
      for (const g of groups) {
        const qty = (g.items ?? []).reduce((sum, c) => sum + (c.quantity || 0), 0);
        addLine(
          g.item_id,
          qty,
          g.items?.[0]?.batch_number,
          Boolean(g.bin_location_id || g.bin_location_code),
        );
      }
    } else {
      for (const item of list.items ?? []) {
        addLine(
          item.item_id,
          item.quantity,
          item.batch_number,
          Boolean(item.bin_location_id || item.bin_location_code),
        );
      }
    }

    const needed = Array.from(neededMap.values());
    if (needed.length === 0) return;

    const map: Record<string, string> = {};
    await Promise.all(needed.map(async (n) => {
      try {
        const suggestions = await putawayService.suggestPutAwayBins({
          item_id: n.item_id,
          quantity: Math.max(1, n.quantity || 1),
          warehouse_id: list.warehouse_id,
          worker_id: actorId,
          batch_number: n.batch_no,
          limit: 1,
        });
        if (suggestions[0]?.bin_code) map[n.item_id] = suggestions[0].bin_code;
      } catch {
        // Suggestion is best-effort — leave the item without a hint.
      }
    }));
    // Discard results from an older list selection that finished late.
    if (requestId !== suggestRequestRef.current) return;
    setSuggestedBins(map);
  }, [worker?.id, user?.id]);

  // ---------- Load Detail ----------
  const handleSelectList = async (list: PutAwayList) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const detail = await putawayService.getPutAwayList(list.id);
      setSelectedList(normalizePutAwayList(detail));
      setViewMode('detail');
      void loadSuggestedBins(detail);
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
      setSelectedList(normalizePutAwayList(detail));
      void loadSuggestedBins(detail);
    } catch {
      // Keep the optimistic local state if the refresh fails.
    }
  }, [loadSuggestedBins]);

  // ---------- Mark items completed in local state ----------
  const markItemsCompleted = (completedIds: string[], binLabel: string) => {
    setSelectedList((prev) => {
      if (!prev) return null;
      const newItems = (prev.items ?? []).map((i) =>
        completedIds.includes(i.id)
          ? { ...i, status: 'completed' as const, completed_at: new Date().toISOString(), bin_location_code: binLabel, bin_full_path: binLabel }
          : i
      );
      const newGroups = (prev.groups ?? []).map((g) =>
        completedIds.includes(g.id) ? { ...g, status: 'completed' as const } : g
      );
      const allDone = newItems.every((i) => i.status === 'completed' || i.status === 'skipped');
      const counts = computeCounts({ ...prev, items: newItems, groups: newGroups });
      return {
        ...prev,
        items: newItems,
        groups: newGroups,
        completed_items: counts.completed,
        pending_items: counts.pending,
        total_items: counts.total,
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
    const pending = (selectedList.items ?? []).filter((i) => i.status === 'pending');
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
        const newItems = (prev.items ?? []).map((i) =>
          i.id === skipTarget.id ? { ...i, status: 'skipped' as const } : i
        );
        const newGroups = (prev.groups ?? []).map((g) =>
          g.id === skipTarget.id ? { ...g, status: 'skipped' as const } : g
        );
        const counts = computeCounts({ ...prev, items: newItems, groups: newGroups });
        return {
          ...prev,
          items: newItems,
          groups: newGroups,
          completed_items: counts.completed,
          pending_items: counts.pending,
          total_items: counts.total,
        };
      });
      await refreshDetail(selectedList.id);
    } catch {
      Alert.alert('Error', 'Failed to skip item.');
    } finally {
      setSkipModalVisible(false);
      setSkipTarget(null);
      setSkipReason('');
    }
  };

  // ---------- Complete List (finalize) ----------
  const handleCompleteList = () => {
    if (!selectedList) return;
    Alert.alert(
      'Complete Put-Away?',
      'All items are done. This will finalize the put-away list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              const detail = await putawayService.getPutAwayList(selectedList.id);
              if (detail.status !== 'completed') {
                Alert.alert(
                  'Not Completed',
                  'This put-away list is not marked complete yet. Please finish all items first.'
                );
                return;
              }
              setSelectedList(normalizePutAwayList(detail));
              Alert.alert('Done', 'Put-away list completed.');
              setViewMode('list');
              setSelectedList(null);
              loadLists();
            } catch {
              Alert.alert('Error', 'Failed to confirm completion. Please try again.');
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
    const apiGroups = selectedList.groups ?? [];
    const hasGroups = apiGroups.length > 0;
    const counts = computeCounts(selectedList);
    const totalItems = counts.total;
    const completedItems = counts.completed;
    const pendingItems = counts.pending;
    const allResolved = totalItems > 0 && pendingItems === 0;
    const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const legacyGroups = buildLegacyDisplayGroups(selectedList.items ?? []);

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
          subtitle={`${completedItems}/${totalItems} done${allResolved ? ' · ✅ COMPLETE' : ''}`}
          isAssigning={assigningAll}
          doneCount={completedItems}
          pendingCount={pendingItems}
          onAssignAll={(locationId, binLabel) => handleAssignAll(locationId, binLabel)}
          onBack={handleBackToList}
          onComplete={handleCompleteList}
          canComplete={allResolved}
        >
          {(ctx) => (
            <View>
              {/* Progress bar */}
              <View style={styles.detailProgressBarWrap}>
                <View style={styles.detailProgressBar}>
                  <View style={[styles.detailProgressFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={styles.detailProgressLabel}>{completedItems}/{totalItems} put away · {progressPct}%</Text>
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

              {/* Grouped rows — new `groups` format (one master pack per row) */}
              {hasGroups ? (
                apiGroups
                  .slice()
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((apiGroup) => {
                    const flatItem = (selectedList.items ?? []).find((i) => i.id === apiGroup.id);
                    const item = flatItem ?? groupToItem(apiGroup);
                    const expanded = expandedGroups.has(apiGroup.id);
                    const isDone = apiGroup.status === 'completed';
                    const isSkipped = apiGroup.status === 'skipped';
                    const children = apiGroup.items ?? [];
                    const batch = children[0]?.batch_number ?? '—';
                    const sku = children[0]?.sku ?? apiGroup.product_name ?? '-';
                    return (
                      <View key={apiGroup.id}>
                        {/* Group (master pack) row */}
                        <TouchableOpacity
                          style={styles.tableRow}
                          activeOpacity={0.7}
                          onPress={() => toggleGroup(apiGroup.id)}
                        >
                          <View style={[styles.tableCell, styles.colProduct]}>
                            <Text style={styles.tableName} numberOfLines={1}>
                              {expanded ? '▼ ' : '▶ '}{apiGroup.product_name ?? sku}
                            </Text>
                            {apiGroup.parent_qseal?.serial_number ? (
                              <Text style={styles.tableSku} numberOfLines={1}>{apiGroup.parent_qseal.serial_number}</Text>
                            ) : null}
                            <Text style={styles.tableSku} numberOfLines={1}>{sku}</Text>
                            {apiGroup.bin_location_code ? (
                              <Text style={styles.tableBin} numberOfLines={1}>📍 {apiGroup.bin_location_code}</Text>
                            ) : apiGroup.item_id && suggestedBins[apiGroup.item_id] ? (
                              <Text style={styles.tableBin} numberOfLines={1}>📍 Suggested: {suggestedBins[apiGroup.item_id]}</Text>
                            ) : null}
                          </View>
                          <View style={[styles.tableCell, styles.colBatch]}>
                            <Text style={styles.tableBatch} numberOfLines={1}>{batch}</Text>
                          </View>
                          <View style={[styles.tableCell, styles.colQty]}>
                            <Text style={styles.tableQty}>{item.quantity}</Text>
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
                                    handleAssignItem(item, ctx.bin);
                                  }}
                                  disabled={assigningAll || completingId === item.id}
                                >
                                  {completingId === item.id ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                  ) : (
                                    <Text style={styles.assignBtnText}>Assign</Text>
                                  )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.skipBtnSmall}
                                  onPress={() => handleSkipItem(item)}
                                >
                                  <Text style={styles.skipBtnSmallText}>✕</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>

                        {/* Individual unit rows */}
                        {expanded &&
                          children.map((child) => (
                            <View
                              key={`${apiGroup.id}-${child.serial_number ?? 'item'}`}
                              style={[styles.tableRow, styles.tableRowChild, isDone && styles.tableRowDone, isSkipped && styles.tableRowSkipped]}
                            >
                              <View style={[styles.tableCell, styles.colProduct]}>
                                <Text style={styles.tableChildName} numberOfLines={1}>
                                  {'   '}{child.serial_number ?? child.batch_number ?? '—'}
                                </Text>
                                {child.manufacturing_date || child.expiry_date ? (
                                  <Text style={styles.tableSku} numberOfLines={1}>
                                    Mfg: {child.manufacturing_date ?? '—'} · Exp: {child.expiry_date ?? '—'}
                                  </Text>
                                ) : null}
                              </View>
                              <View style={[styles.tableCell, styles.colBatch]}>
                                <Text style={styles.tableBatch} numberOfLines={1}>{child.batch_number ?? '—'}</Text>
                              </View>
                              <View style={[styles.tableCell, styles.colQty]}>
                                <Text style={styles.tableQty}>{child.quantity || 1}</Text>
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
                                ) : null}
                              </View>
                            </View>
                          ))}
                      </View>
                    );
                  })
              ) : (
                /* Legacy flat `items` format (grouped by SKU) */
                legacyGroups.map((group) => {
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
                          {group.children[0]?.bin_location_code ? (
                            <Text style={styles.tableBin} numberOfLines={1}>📍 {group.children[0].bin_location_code}</Text>
                          ) : suggestedBins[group.key] ? (
                            <Text style={styles.tableBin} numberOfLines={1}>📍 Suggested: {suggestedBins[group.key]}</Text>
                          ) : null}
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
                                <Text style={styles.tableBatch} numberOfLines={1}>
                                  {child.serial_nos && child.serial_nos.length > 0
                                    ? `${child.serial_nos.length} serials`
                                    : child.batch_number || '—'}
                                </Text>
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
                })
              )}

              {/* All done state */}
              {allResolved && (
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



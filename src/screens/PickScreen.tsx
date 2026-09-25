// ============================================================
// Pick Screen — List, scan and complete pick lists (reverse of put-away)
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
    Modal,
    TextInput,
    ScrollView,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';
import * as pickService from '@/api/pickService';
import * as qsealService from '@/api/qsealService';
import QrScanner from '@/components/QrScanner';
import PutawayHeader from '@/components/putaway/PutawayHeader';
import PickListCard from '@/components/pick/PickListCard';
import PickItemsTable from '@/components/pick/PickItemsTable';
import AssignWorkerModal from '@/components/pick/AssignWorkerModal';
import { styles } from '@/components/pick/PickScreen.styles';
import { extractQSealSerial, extractQSealParentSerial } from '@/utils/qsealUrl';
import { getBackendErrorMessage } from '@/utils/errors';
import { parseBinQR, lookupBinByQr } from '@/components/putaway/binScanner';
import type { PickGroup } from '@/components/pick/types';
import type { PickList, PickListItem, PickListSummary, PickScanResult, Worker } from '@/types';

type ViewMode = 'list' | 'detail';

/**
 * Normalize a pick-list detail response into the flat `items` shape the screen
 * renders. New API responses carry `groups` (one group per master pack); older
 * responses carry a flat `items` array.
 */
function normalizePickList(list: PickList): PickList {
    let items: PickListItem[];
    if (Array.isArray(list.items) && list.items.length > 0) {
        items = list.items;
    } else if (Array.isArray(list.groups) && list.groups.length > 0) {
        items = list.groups.map((group, index) => {
            const children = Array.isArray(group.items) ? group.items : [];
            const first = children[0];
            const groupQty = children.reduce((s, c) => s + (c.quantity || 0), 0);
            return {
                id: group.parent_qseal?.id ?? `group-${index}`,
                item_id: group.parent_qseal?.id ?? `group-${index}`,
                item_name: group.product_name ?? first?.sku ?? null,
                sku: first?.sku ?? group.product_name ?? null,
                qty: groupQty,
                picked_qty: group.picked_qty ?? 0,
                uom: '',
                per_case_qty: group.parent_qseal?.capacity ?? null,
                case_qty: group.parent_qseal ? 1 : null,
                loose_qty: groupQty,
                batch_no: first?.batch_number ?? null,
                bin_location_id: group.bin_location_id,
                bin_location_path: group.bin_location_path ?? null,
                serials: children
                    .filter((c) => !!c.serial_number)
                    .map((c) => ({
                        serial_number: c.serial_number as string,
                        sku: c.sku ?? null,
                        manufacturing_date: c.manufacturing_date ?? null,
                        expiry_date: c.expiry_date ?? null,
                    })),
            };
        });
    } else {
        items = [];
    }
    return { ...list, items };
}

/**
 * Convert a pick-scan error into operator-friendly copy. Backend errors carry
 * an `error` code and `entity_type` that are engineering details — map the
 * known cases to plain language, and fall back to the shared backend-message
 * extractor (which also covers network/timeout errors).
 */
function friendlyScanError(err: any): string {
    const data = err?.response?.data;
    const code = typeof data?.error === 'string' ? data.error : null;
    const entityType = typeof data?.entity_type === 'string' ? data.entity_type : null;

    if (code === 'NOT_FOUND' && entityType === 'BinStockLevel') {
        return 'No stock in this bin for the item — check the bin or skip the item.';
    }
    if (code === 'NOT_FOUND') {
        return 'Item not found — it may already be picked or not on this list.';
    }
    return getBackendErrorMessage(err) || 'Scan failed. Please try again.';
}

export default function PickScreen() {
    const { selectedWarehouse, user, worker } = useAuthStore();
    const orgId = user?.organization_id || worker?.organization_id || '';

    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [lists, setLists] = useState<PickListSummary[]>([]);
    const [selectedList, setSelectedList] = useState<PickList | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // item_id → suggested bin label for manual-mode lines without an assigned bin
    const [suggestedBins, setSuggestedBins] = useState<Record<string, string>>({});
    // Guards against stale suggestion responses overwriting a newer list's bins.
    const suggestRequestRef = useRef(0);

    // Org pick setting: whether a bin scan is required (gates the client-side
    // wrong-bin check). Default true keeps the hard stop until settings load.
    const [requireBinScan, setRequireBinScan] = useState(true);

    // Scan state
    const [scanText, setScanText] = useState('');
    const [scanning, setScanning] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [scanNotice, setScanNotice] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

    // Bin verification state — the last verified source bin, sent with item
    // scans to satisfy the backend's `require_bin_scan` wrong-bin hard stop.
    const [verifiedBin, setVerifiedBin] = useState<{ locationId: string; label: string } | null>(null);

    // Reassign state
    const [reassignVisible, setReassignVisible] = useState(false);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [loadingWorkers, setLoadingWorkers] = useState(false);

    // Expanded groups
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // ---------- Load Pick Lists ----------
    const loadLists = useCallback(async () => {
        if (!selectedWarehouse) return;
        setError(null);
        try {
            const response = await pickService.getPickLists({
                warehouse_id: selectedWarehouse.id,
                page_size: 50,
            });
            // Workers pick draft / confirmed / pending / in-progress lists
            const active = (response.pick_lists || []).filter(
                (l) =>
                    l.status === 'draft' ||
                    l.status === 'confirmed' ||
                    l.status === 'pending_picking' ||
                    l.status === 'in_progress',
            );
            setLists(active);
        } catch {
            setError('Failed to load pick lists.');
        }
    }, [selectedWarehouse]);

    useEffect(() => {
        loadLists();
    }, [loadLists]);

    // Load the org's pick settings once so the client-side wrong-bin check
    // respects the `require_bin_scan` flag.
    useEffect(() => {
        let cancelled = false;
        pickService
            .getPickSettings()
            .then((s) => {
                if (!cancelled) setRequireBinScan(s.require_bin_scan ?? true);
            })
            .catch(() => {
                // Keep the safe default (true) on failure.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadLists();
        setRefreshing(false);
    };

    // ---------- Suggested bins (manual mode) ----------
    // Pick lists generated in manual mode have no bin_location_id on their
    // lines, so ask the smart location engine for the best bin per item.
    const loadSuggestedBins = useCallback(async (list: PickList) => {
        if (!worker?.id || !list.warehouse_id) return;
        const requestId = ++suggestRequestRef.current;
        setSuggestedBins({});

        // Aggregate needed items by item_id so lines of the same item with
        // different batches are summed into one request (not reduced to the
        // first line's batch and quantity).
        const neededMap = new Map<string, { item_id: string; quantity: number; batch_no: string | null }>();
        for (const item of list.items ?? []) {
            if (item.bin_location_id || item.bin_location_path) continue;
            if (!item.item_id) continue;
            const existing = neededMap.get(item.item_id);
            if (existing) {
                existing.quantity += item.qty || 0;
                if (!existing.batch_no) existing.batch_no = item.batch_no;
            } else {
                neededMap.set(item.item_id, {
                    item_id: item.item_id,
                    quantity: item.qty || 0,
                    batch_no: item.batch_no,
                });
            }
        }
        const needed = Array.from(neededMap.values());
        if (needed.length === 0) return;

        const map: Record<string, string> = {};
        await Promise.all(needed.map(async (n) => {
            try {
                const suggestions = await pickService.suggestPickBins({
                    item_id: n.item_id,
                    quantity: Math.max(1, n.quantity || 1),
                    warehouse_id: list.warehouse_id,
                    worker_id: worker.id,
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
    }, [worker?.id]);

    // ---------- Load Detail ----------
    const handleSelectList = async (list: PickListSummary) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const detail = await pickService.getPickList(list.id);
            setSelectedList(normalizePickList(detail));
            setVerifiedBin(null);
            setViewMode('detail');
            void loadSuggestedBins(detail);
        } catch {
            Alert.alert('Error', 'Failed to load pick list details.');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshDetail = useCallback(async (id: string) => {
        try {
            const detail = await pickService.getPickList(id);
            setSelectedList(normalizePickList(detail));
            void loadSuggestedBins(detail);
        } catch { }
    }, [loadSuggestedBins]);

    // ---------- Scan feedback helpers (non-blocking) ----------
    const showScanNotice = (type: 'success' | 'warning' | 'error', text: string) => {
        setScanNotice({ type, text });
    };

    const classifyPick = (result: PickScanResult, scannedSerial: string): 'correct' | 'same-sku' | 'off-list' => {
        const expectedSerials = new Set(
            (selectedList?.items ?? []).flatMap((i) => (i.serials ?? []).map((s) => s.serial_number)),
        );
        // "Correct box" means the scanned serial is one the pick list actually expects.
        if (expectedSerials.has(scannedSerial)) return 'correct';
        // item_id ↔ SKU is 1:1, so a sku/item_id match means "same product, different box".
        const skuMatch = (selectedList?.items ?? []).some(
            (i) => i.sku === result.sku || i.item_id === result.item_id,
        );
        return skuMatch ? 'same-sku' : 'off-list';
    };

    // Record a single pick scan and surface non-blocking feedback.
    const recordSinglePick = async (
        qrData: string,
        scannedSerial?: string,
        binLocationId?: string | null,
    ) => {
        if (!selectedList) return;
        const result = await pickService.recordPickScan(selectedList.id, qrData, binLocationId ?? verifiedBin?.locationId ?? null);
        const serial = scannedSerial ?? extractQSealSerial(qrData) ?? qrData;
        const category = classifyPick(result, serial);
        const matched = (selectedList.items ?? []).find(
            (i) => i.sku === result.sku || i.item_id === result.item_id,
        );
        const suggestedBin = matched?.bin_location_path || matched?.bin_location_id || null;

        if (category === 'correct') {
            showScanNotice(
                'success',
                `✓ Correct box · ${result.sku} — ${result.scanned_qty} picked (${result.remaining_qty} left)${suggestedBin ? ` · 📍 ${suggestedBin}` : ''}`,
            );
        } else if (category === 'same-sku') {
            showScanNotice(
                'warning',
                `⚠ Same SKU, different box · ${result.sku} — picked anyway (${result.remaining_qty} left)`,
            );
        } else {
            showScanNotice(
                'warning',
                `⚠ ${result.sku} is not on this pick list — recorded anyway`,
            );
        }
        return result;
    };

    // ---------- Scan an item QR (or verify a bin/location QR) ----------
    const handleScan = async (data: string) => {
        if (!selectedList) return;
        const qr = data.trim();
        if (!qr) return;

        // Location/bin QR detection — verify against the pick list's suggested bins.
        const binInfo = parseBinQR(qr);
        const suggestedPaths = new Set(
            (selectedList.items ?? []).map((i) => i.bin_location_path).filter(Boolean) as string[],
        );
        const suggestedIds = new Set(
            (selectedList.items ?? []).map((i) => i.bin_location_id).filter(Boolean) as string[],
        );
        if (binInfo || suggestedPaths.has(qr) || suggestedIds.has(qr)) {
            let label = binInfo?.full_path || binInfo?.location_code || binInfo?.qr_code || qr;
            let locationId = binInfo?.location_id || (suggestedIds.has(qr) ? qr : '');
            if (binInfo && !locationId) {
                const resolved = await lookupBinByQr(binInfo.qr_code);
                if (resolved) {
                    label = resolved.full_path || resolved.location_code || label;
                    locationId = resolved.location_id;
                }
            }
            // Enforce the wrong-bin check only when the org requires a bin scan
            // AND the list carries assigned bins (auto mode). When the flag is
            // off, or the list is manual (no assigned bins), any bin is accepted.
            const hasAssignedBins = suggestedPaths.size > 0 || suggestedIds.size > 0;
            const enforceBin = requireBinScan && hasAssignedBins;
            const matches =
                !enforceBin ||
                (locationId && suggestedIds.has(locationId)) ||
                suggestedPaths.has(label) ||
                suggestedPaths.has(qr) ||
                suggestedIds.has(qr);
            if (matches) {
                // If the scan only carried a full path (no UUID / no QR-code
                // lookup), fall back to the suggested line's bin id.
                if (!locationId) {
                    const hit = (selectedList.items ?? []).find(
                        (i) => i.bin_location_path === qr || i.bin_location_id === qr,
                    );
                    locationId = hit?.bin_location_id || '';
                }
                // A path-only bin can end up with no resolvable location id.
                // Never mark it verified with an empty identifier — that empty
                // string would be sent as `bin_location_id` on later item scans.
                if (!locationId) {
                    setVerifiedBin(null);
                    showScanNotice(
                        'warning',
                        `📍 Bin path matched (${label}), but its location id is missing — item scans will not carry a bin id.`,
                    );
                } else {
                    setVerifiedBin({ locationId, label });
                    showScanNotice(
                        'success',
                        `📍 Bin verified: ${label} — now scan the item to pick.`,
                    );
                }
            } else {
                setVerifiedBin(null);
                const hint = Array.from(suggestedPaths).slice(0, 3).join('\n');
                Alert.alert(
                    'Wrong Bin',
                    `⚠️ ${label}\nThis bin is not on this pick list.\n\nSuggested bins:\n${hint || '—'}`,
                );
            }
            setScanText('');
            return;
        }

        setSubmitting(true);
        setScanNotice(null);
        try {
            // QSeal parent box → resolve linked units and pick each child serial.
            const parentSerial = extractQSealParentSerial(qr);
            if (parentSerial && orgId) {
                const node = await qsealService.scanQSeal(orgId, {
                    serial_number: parentSerial,
                    device_type: 'mobile',
                    os: 'iOS/Android',
                    ip_address: '',
                });
                const parent = await qsealService.getLinkedUnits(node.node_id);
                const units = parent.linked_units || [];
                console.log('[PickScreen] linked units:', units.map((u) => ({ serial: u.serial_number, sku: u.product_sku, batch: u.dispatch_batch, itemUrl: u.product_item_url })));
                if (units.length === 0) {
                    showScanNotice('warning', `⚠ Box ${parent.name || parentSerial} has no linked units.`);
                } else {
                    // Each linked unit's serial_number is the ProductItem serial
                    // (the same value the inbound flow scans), so send the bare
                    // serial. The outbound scan endpoint resolves it against
                    // ProductItem with the pick list's organization scope.
                    // Scans run sequentially so each pick line is matched and
                    // committed one at a time (parallel scans race on "first
                    // remaining line").
                    let correct = 0;
                    let sameSku = 0;
                    let offList = 0;
                    let failed = 0;
                    const failureReasons = new Set<string>();
                    for (const unit of units) {
                        try {
                            const result = await pickService.recordPickScan(
                                selectedList.id,
                                unit.serial_number,
                                verifiedBin?.locationId ?? null,
                            );
                            const category = classifyPick(result, unit.serial_number);
                            if (category === 'correct') correct += 1;
                            else if (category === 'same-sku') sameSku += 1;
                            else offList += 1;
                        } catch (err: any) {
                            failed += 1;
                            failureReasons.add(friendlyScanError(err));
                            // Raw detail goes to the dev log only — the worker
                            // sees the friendly summary below.
                            console.warn(
                                '[PickScreen] failed unit:',
                                unit.serial_number,
                                err?.response?.data ?? err?.message,
                            );
                        }
                    }
                    await refreshDetail(selectedList.id);
                    const picked = correct + sameSku + offList;
                    const parts = [`📦 ${parent.name || parentSerial}: ${picked} unit(s) picked`];
                    if (sameSku > 0) parts.push(`${sameSku} same-SKU (different box)`);
                    if (offList > 0) parts.push(`${offList} off-list`);
                    if (failed > 0) parts.push(`${failed} not picked`);
                    if (failureReasons.size > 0) {
                        parts.push(Array.from(failureReasons).join(' · '));
                    }
                    showScanNotice(sameSku > 0 || offList > 0 || failed > 0 ? 'warning' : 'success', parts.join(' · '));
                }
                return;
            }

            // Direct item/serial QR → record the pick.
            await recordSinglePick(qr);
            await refreshDetail(selectedList.id);
        } catch (err: any) {
            showScanNotice('error', friendlyScanError(err));
        } finally {
            setSubmitting(false);
            setScanText('');
        }
    };

    // ---------- Complete / Cancel ----------
    const handleComplete = () => {
        if (!selectedList) return;
        Alert.alert('Mark Complete?', 'All items must be fully picked before completing.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Complete',
                onPress: async () => {
                    try {
                        await pickService.completePickList(selectedList.id);
                        Alert.alert('Done', 'Pick list completed.');
                        setViewMode('list');
                        setSelectedList(null);
                        loadLists();
                    } catch (err: any) {
                        const d = err?.response?.data?.detail || 'Failed to complete.';
                        Alert.alert('Error', d);
                    }
                },
            },
        ]);
    };

    const handleCancel = () => {
        if (!selectedList) return;
        Alert.alert('Cancel Pick List?', 'Cancelling will release any reserved stock.', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Cancel List',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await pickService.cancelPickList(selectedList.id);
                        Alert.alert('Done', 'Pick list cancelled.');
                        setViewMode('list');
                        setSelectedList(null);
                        loadLists();
                    } catch (err: any) {
                        const d = err?.response?.data?.detail || 'Failed to cancel.';
                        Alert.alert('Error', d);
                    }
                },
            },
        ]);
    };

    // ---------- Reassign Worker ----------
    const openReassign = async () => {
        setReassignVisible(true);
        setLoadingWorkers(true);
        try {
            const ws = await pickService.listWorkers();
            setWorkers(ws);
        } catch {
            setWorkers([]);
        } finally {
            setLoadingWorkers(false);
        }
    };

    const confirmReassign = async (worker: Worker) => {
        if (!selectedList) return;
        setReassignVisible(false);
        try {
            const updated = await pickService.assignWorker(selectedList.id, worker.id);
            setSelectedList(updated);
            Alert.alert('Assigned', `Assigned to ${worker.display_name || worker.first_name || worker.id}`);
        } catch (err: any) {
            const d = err?.response?.data?.detail || 'Failed to assign worker.';
            Alert.alert('Error', d);
        }
    };

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

    const handleBackToList = () => {
        setViewMode('list');
        setSelectedList(null);
        setVerifiedBin(null);
        loadLists();
    };

    // ============ LIST VIEW ============
    if (viewMode === 'list') {
        return (
            <View style={styles.container}>
                <PutawayHeader title="Pick Lists" subtitle={`${lists.length} active · ${selectedWarehouse?.name || ''}`} showWarehouseSelector />
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
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A73E8" />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>📤</Text>
                            <Text style={styles.emptyText}>No pick lists</Text>
                            <Text style={styles.emptySubtext}>Pick lists are created from incoming orders.</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <PickListCard item={item} onPress={() => handleSelectList(item)} />
                    )}
                />
            </View>
        );
    }

    // ============ DETAIL VIEW ============
    if (viewMode === 'detail' && selectedList) {
        const pickedQty = selectedList.progress?.picked_qty ?? 0;
        const totalQty = selectedList.progress?.total_qty ?? 0;
        const pct = selectedList.progress?.completion_percentage ?? (totalQty > 0 ? (pickedQty / totalQty) * 100 : 0);
        const allPicked = totalQty > 0 && pickedQty >= totalQty;

        // Group items by SKU for a collapsible parent → serial table
        const groups: PickGroup[] = [];
        const groupIndex = new Map<string, PickGroup>();
        for (const item of selectedList.items ?? []) {
            const key = item.item_id || item.sku || item.id;
            let g = groupIndex.get(key);
            if (!g) {
                g = { key, name: item.item_name || item.sku || key, sku: item.sku || '—', children: [] };
                groupIndex.set(key, g);
                groups.push(g);
            }
            g.children.push(item);
        }

        return (
            <View style={styles.container}>
                <PutawayHeader
                    title={selectedList.pick_list_no}
                    subtitle={`${pickedQty}/${totalQty} units picked`}
                    onBack={handleBackToList}
                />

                {/* Progress */}
                <View style={styles.detailProgressWrap}>
                    <View style={styles.detailProgressBar}>
                        <View style={[styles.detailProgressFill, { width: `${Math.round(pct)}%` }]} />
                    </View>
                    <Text style={styles.detailProgressText}>{Math.round(pct)}% · {totalQty - pickedQty} remaining</Text>
                </View>

                {/* Scan input */}
                <View style={styles.scanRow}>
                    <View style={styles.scanInputWrap}>
                        <Text style={styles.scanIcon}>📷</Text>
                        <TextInput
                            style={styles.scanInput}
                            placeholder="Scan item QR code..."
                            placeholderTextColor="#6B7280"
                            value={scanText}
                            onChangeText={setScanText}
                            onSubmitEditing={() => handleScan(scanText)}
                            autoCapitalize="none"
                            returnKeyType="go"
                        />
                    </View>
                    <TouchableOpacity style={styles.cameraBtn} onPress={() => setScanning(true)}>
                        <Text style={styles.cameraIcon}>📷</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.scanBtn, (!scanText.trim() || submitting) && styles.btnDisabled]}
                        onPress={() => handleScan(scanText)}
                        disabled={!scanText.trim() || submitting}
                    >
                        {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.scanBtnText}>Scan</Text>}
                    </TouchableOpacity>
                </View>

                {/* Scan feedback (non-blocking) */}
                {scanNotice && (
                    <View style={[styles.scanNotice, scanNotice.type === 'success' ? styles.scanNoticeSuccess : scanNotice.type === 'warning' ? styles.scanNoticeWarning : styles.scanNoticeError]}>
                        <Text style={[styles.scanNoticeText, scanNotice.type === 'success' ? styles.scanNoticeTextSuccess : scanNotice.type === 'warning' ? styles.scanNoticeTextWarning : styles.scanNoticeTextError]}>
                            {scanNotice.text}
                        </Text>
                    </View>
                )}

                {/* Verified source bin (persistent) */}
                {verifiedBin && (
                    <View style={styles.binActiveBar}>
                        <Text style={styles.binActiveText} numberOfLines={1}>📍 Active bin: {verifiedBin.label}</Text>
                    </View>
                )}

                {/* Worker / actions */}
                <View style={styles.actionBar}>
                    <Text style={styles.workerText} numberOfLines={1}>
                        👤 {selectedList.worker_name || 'Unassigned'}
                    </Text>
                    <TouchableOpacity style={styles.reassignBtn} onPress={openReassign}>
                        <Text style={styles.reassignText}>{selectedList.assigned_to ? 'Re-assign' : 'Assign'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Items table */}
                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tableContent}>
                    <PickItemsTable groups={groups} expandedGroups={expandedGroups} suggestedBins={suggestedBins} onToggleGroup={toggleGroup} />
                </ScrollView>

                {/* Footer actions */}
                <View style={styles.footer}>
                    <TouchableOpacity style={styles.footerCancelBtn} onPress={handleCancel}>
                        <Text style={styles.footerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.footerCompleteBtn, !allPicked && styles.btnDisabled]}
                        onPress={handleComplete}
                        disabled={!allPicked}
                    >
                        <Text style={styles.footerCompleteText}>Complete</Text>
                    </TouchableOpacity>
                </View>

                {/* Scanner modal */}
                <Modal visible={scanning} animationType="slide" presentationStyle="fullScreen">
                    <View style={styles.scannerContainer}>
                        <QrScanner onScan={(d: string) => { setScanning(false); handleScan(d); }} onClose={() => setScanning(false)} />
                        <TouchableOpacity style={styles.scannerCloseBtn} onPress={() => setScanning(false)}>
                            <Text style={styles.closeIcon}>✕</Text>
                        </TouchableOpacity>
                    </View>
                </Modal>

                {/* Reassign modal */}
                <AssignWorkerModal
                    visible={reassignVisible}
                    loading={loadingWorkers}
                    workers={workers}
                    onSelect={confirmReassign}
                    onClose={() => setReassignVisible(false)}
                />
            </View>
        );
    }

    return null;
}



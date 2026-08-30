// ============================================================
// Pick Screen — List, scan and complete pick lists (reverse of put-away)
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
import { parseBinQR, lookupBinByQr } from '@/components/putaway/binScanner';
import type { PickGroup } from '@/components/pick/types';
import type { PickList, PickListSummary, PickScanResult, Worker } from '@/types';

type ViewMode = 'list' | 'detail';

export default function PickScreen() {
    const { selectedWarehouse, user, worker } = useAuthStore();
    const orgId = user?.organization_id || worker?.organization_id || '';

    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [lists, setLists] = useState<PickListSummary[]>([]);
    const [selectedList, setSelectedList] = useState<PickList | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Scan state
    const [scanText, setScanText] = useState('');
    const [scanning, setScanning] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [scanNotice, setScanNotice] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

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
            // Workers only pick draft / in-progress lists
            const active = (response.pick_lists || []).filter(
                (l) => l.status === 'draft' || l.status === 'in_progress',
            );
            setLists(active);
        } catch {
            setError('Failed to load pick lists.');
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
    const handleSelectList = async (list: PickListSummary) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const detail = await pickService.getPickList(list.id);
            setSelectedList(detail);
            setViewMode('detail');
        } catch {
            Alert.alert('Error', 'Failed to load pick list details.');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshDetail = useCallback(async (id: string) => {
        try {
            const detail = await pickService.getPickList(id);
            setSelectedList(detail);
        } catch { }
    }, []);

    // ---------- Scan feedback helpers (non-blocking) ----------
    const showScanNotice = (type: 'success' | 'warning' | 'error', text: string) => {
        setScanNotice({ type, text });
    };

    const classifyPick = (result: PickScanResult, scannedSerial: string): 'correct' | 'same-sku' | 'off-list' => {
        const expectedSerials = new Set(
            selectedList?.items.flatMap((i) => (i.serials ?? []).map((s) => s.serial_number)) ?? [],
        );
        // "Correct box" means the scanned serial is one the pick list actually expects.
        if (expectedSerials.has(scannedSerial)) return 'correct';
        // item_id ↔ SKU is 1:1, so a sku/item_id match means "same product, different box".
        const skuMatch = !!selectedList?.items.some(
            (i) => i.sku === result.sku || i.item_id === result.item_id,
        );
        return skuMatch ? 'same-sku' : 'off-list';
    };

    // Record a single pick scan and surface non-blocking feedback.
    const recordSinglePick = async (qrData: string, scannedSerial?: string) => {
        if (!selectedList) return;
        const result = await pickService.recordPickScan(selectedList.id, qrData);
        const serial = scannedSerial ?? extractQSealSerial(qrData) ?? qrData;
        const category = classifyPick(result, serial);
        const matched = selectedList.items.find(
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
            selectedList.items.map((i) => i.bin_location_path).filter(Boolean) as string[],
        );
        const suggestedIds = new Set(
            selectedList.items.map((i) => i.bin_location_id).filter(Boolean) as string[],
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
            const matches =
                (locationId && suggestedIds.has(locationId)) ||
                suggestedPaths.has(label) ||
                suggestedPaths.has(qr) ||
                suggestedIds.has(qr);
            if (matches) {
                Alert.alert(
                    'Bin Verified',
                    `📍 ${label}\nThis is a suggested bin for this pick list. Now scan the item to pick.`,
                );
            } else {
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
                if (units.length === 0) {
                    showScanNotice('warning', `⚠ Box ${parent.name || parentSerial} has no linked units.`);
                } else {
                    const results = await Promise.allSettled(
                        units.map((unit) => pickService.recordPickScan(selectedList.id, unit.serial_number)),
                    );
                    let correct = 0;
                    let sameSku = 0;
                    let offList = 0;
                    let failed = 0;
                    results.forEach((r, i) => {
                        if (r.status === 'fulfilled') {
                            const category = classifyPick(r.value, units[i].serial_number);
                            if (category === 'correct') correct += 1;
                            else if (category === 'same-sku') sameSku += 1;
                            else offList += 1;
                        } else {
                            failed += 1;
                        }
                    });
                    await refreshDetail(selectedList.id);
                    const picked = correct + sameSku + offList;
                    const parts = [`📦 ${parent.name || parentSerial}: ${picked} unit(s) picked`];
                    if (sameSku > 0) parts.push(`${sameSku} same-SKU (different box)`);
                    if (offList > 0) parts.push(`${offList} off-list`);
                    if (failed > 0) parts.push(`${failed} failed`);
                    showScanNotice(sameSku > 0 || offList > 0 || failed > 0 ? 'warning' : 'success', parts.join(' · '));
                }
                return;
            }

            // Direct item/serial QR → record the pick.
            await recordSinglePick(qr);
            await refreshDetail(selectedList.id);
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Scan failed';
            showScanNotice('error', `Scan failed: ${detail}`);
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
        loadLists();
    };

    // ============ LIST VIEW ============
    if (viewMode === 'list') {
        return (
            <View style={styles.container}>
                <PutawayHeader title="Pick Lists" subtitle={`${lists.length} active · ${selectedWarehouse?.name || ''}`} />
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
        for (const item of selectedList.items) {
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
                    <PickItemsTable groups={groups} expandedGroups={expandedGroups} onToggleGroup={toggleGroup} />
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



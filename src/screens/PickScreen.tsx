// ============================================================
// Pick Screen — List, scan and complete pick lists (reverse of put-away)
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
    ScrollView,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';
import * as pickService from '@/api/pickService';
import QrScanner from '@/components/QrScanner';
import { parseBinQR, lookupBinByQr } from '@/components/putaway/binScanner';
import type { PickList, PickListSummary, PickListItem, PickSerialDetail, Worker } from '@/types';

type ViewMode = 'list' | 'detail';

interface PickGroup {
    key: string;
    name: string;
    sku: string;
    children: PickListItem[];
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

export default function PickScreen() {
    const { selectedWarehouse } = useAuthStore();

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

        // Item/serial QR → record the pick
        setSubmitting(true);
        try {
            const result = await pickService.recordPickScan(selectedList.id, qr);
            const matched = selectedList.items.find(
                (i) => i.sku === result.sku || i.item_id === result.item_id,
            );
            const suggestedBin = matched?.bin_location_path || matched?.bin_location_id || null;
            await refreshDetail(selectedList.id);
            Alert.alert(
                'Scanned',
                `${result.sku} — ${result.scanned_qty} picked (${result.remaining_qty} left)${suggestedBin ? `\n📍 Suggested bin: ${suggestedBin}` : ''}`,
            );
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Scan failed';
            Alert.alert('Scan Failed', detail);
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
                <Header title="Pick Lists" subtitle={`${lists.length} active · ${selectedWarehouse?.name || ''}`} />
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
                    renderItem={({ item }) => {
                        const picked = item.progress?.picked_qty ?? 0;
                        const total = item.progress?.total_qty ?? 0;
                        const progress = total > 0 ? picked / total : 0;
                        return (
                            <TouchableOpacity
                                style={[styles.listCard, item.status === 'completed' && styles.listCardCompleted]}
                                onPress={() => handleSelectList(item)}
                            >
                                <View style={styles.listCardHeader}>
                                    <Text style={styles.listNo}>{item.pick_list_no}</Text>
                                    <View style={[styles.listStatus, item.status === 'in_progress' ? styles.listStatusActive : styles.listStatusDraft]}>
                                        <Text style={styles.listStatusText}>{item.status}</Text>
                                    </View>
                                </View>
                                <Text style={styles.listInvoice}>{item.invoice_reference || '—'}</Text>
                                <View style={styles.progressBar}>
                                    <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                                </View>
                                <Text style={styles.listDetail}>{picked}/{total} units picked</Text>
                            </TouchableOpacity>
                        );
                    }}
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
                <Header
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
                    <View style={styles.tableHeaders}>
                        <Text style={[styles.tableHeader, styles.colProduct]}>Product / SKU</Text>
                        <Text style={[styles.tableHeader, styles.colBatch]}>Batch</Text>
                        <Text style={[styles.tableHeader, styles.colQty]}>Qty</Text>
                        <Text style={[styles.tableHeader, styles.colPicked]}>Picked</Text>
                    </View>

                    {groups.map((group) => {
                        const expanded = expandedGroups.has(group.key);
                        const groupQty = group.children.reduce((s, c) => s + (c.qty || 0), 0);
                        const groupPicked = group.children.reduce((s, c) => s + (c.picked_qty || 0), 0);
                        const batch = group.children.map((c) => c.batch_no).find((b) => !!b) ?? null;
                        const bins = Array.from(new Set(
                            group.children.map((c) => c.bin_location_path || c.bin_location_id || '').filter(Boolean),
                        ));
                        const serialRows: { serial: PickSerialDetail; bin: string | null }[] = [];
                        const seenSerials = new Set<string>();
                        for (const c of group.children) {
                            const bin = c.bin_location_path || c.bin_location_id || null;
                            for (const s of c.serials ?? []) {
                                if (s.serial_number && !seenSerials.has(s.serial_number)) {
                                    seenSerials.add(s.serial_number);
                                    serialRows.push({ serial: s, bin });
                                }
                            }
                        }
                        return (
                            <View key={group.key}>
                                <TouchableOpacity style={styles.tableRow} activeOpacity={0.7} onPress={() => toggleGroup(group.key)}>
                                    <View style={[styles.tableCell, styles.colProduct]}>
                                        <Text style={styles.tableName} numberOfLines={1}>
                                            {expanded ? '▼ ' : '▶ '}{group.name}
                                        </Text>
                                        <Text style={styles.tableSku} numberOfLines={1}>{group.sku}</Text>
                                        {bins.length > 0 && (
                                            <Text style={styles.tableBin} numberOfLines={1}>
                                                📍 {bins[0]}{bins.length > 1 ? ` +${bins.length - 1}` : ''}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={[styles.tableCell, styles.colBatch]}>
                                        <Text style={styles.tableBatch} numberOfLines={1}>{batch || '—'}</Text>
                                    </View>
                                    <View style={[styles.tableCell, styles.colQty]}>
                                        <Text style={styles.tableQty}>{groupQty}</Text>
                                    </View>
                                    <View style={[styles.tableCell, styles.colPicked]}>
                                        <Text style={[styles.tableQty, groupPicked >= groupQty && { color: '#10B981' }]}>{groupPicked}</Text>
                                    </View>
                                </TouchableOpacity>

                                {expanded && serialRows.map(({ serial: s, bin }, idx: number) => (
                                    <View key={`${s.serial_number}-${idx}`} style={[styles.tableRow, styles.tableRowChild]}>
                                        <View style={[styles.tableCell, styles.colProduct]}>
                                            <Text style={styles.serialText}>S.N: {s.serial_number}</Text>
                                        </View>
                                        <View style={[styles.tableCell, { flex: 1 }]}>
                                            <Text style={styles.serialMeta}>
                                                SKU: {s.sku ?? group.sku}
                                                {s.manufacturing_date ? `  Mfg: ${s.manufacturing_date.slice(0, 10)}` : ''}
                                                {s.expiry_date ? `  Exp: ${s.expiry_date.slice(0, 10)}` : ''}
                                            </Text>
                                            {bin && <Text style={styles.tableBin}>📍 Bin: {bin}</Text>}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        );
                    })}
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
                <Modal visible={reassignVisible} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Assign Worker</Text>
                            {loadingWorkers ? (
                                <ActivityIndicator color="#1A73E8" />
                            ) : (
                                <ScrollView style={{ maxHeight: 320 }}>
                                    {workers.map((w) => (
                                        <TouchableOpacity key={w.id} style={styles.workerRow} onPress={() => confirmReassign(w)}>
                                            <Text style={styles.workerName}>{w.display_name || `${w.first_name} ${w.last_name}`}</Text>
                                            {w.employee_id ? <Text style={styles.workerMeta}>{w.employee_id}</Text> : null}
                                        </TouchableOpacity>
                                    ))}
                                    {workers.length === 0 && <Text style={styles.emptyText}>No workers found</Text>}
                                </ScrollView>
                            )}
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setReassignVisible(false)}>
                                <Text style={styles.modalCancelText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F1923' },

    // Header
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

    // List
    listContent: { paddingHorizontal: 16, paddingBottom: 24 },
    listCard: {
        backgroundColor: '#1A2332', borderRadius: 12, borderWidth: 1, borderColor: '#2A3A4A',
        padding: 14, marginBottom: 10,
    },
    listCardCompleted: { opacity: 0.55 },
    listCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    listNo: { color: '#E0E8F0', fontSize: 15, fontWeight: '700' },
    listStatus: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    listStatusDraft: { backgroundColor: '#1E3A5F' },
    listStatusActive: { backgroundColor: '#1A73E8' },
    listStatusText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    listInvoice: { color: '#8899AA', fontSize: 12, marginTop: 4 },
    progressBar: { height: 6, backgroundColor: '#2A3A4A', borderRadius: 3, marginTop: 10, overflow: 'hidden' },
    progressFill: { height: 6, backgroundColor: '#1A73E8', borderRadius: 3 },
    listDetail: { color: '#8899AA', fontSize: 12, marginTop: 6 },

    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 44 },
    emptyText: { color: '#E0E8F0', fontSize: 16, fontWeight: '600', marginTop: 12 },
    emptySubtext: { color: '#667788', fontSize: 13, marginTop: 4, textAlign: 'center' },

    // Error / loading banners
    errorBanner: { backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, marginBottom: 8, borderRadius: 8 },
    errorText: { color: '#FCA5A5', fontSize: 13 },
    loadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    loadingText: { color: '#8899AA', fontSize: 13 },

    // Detail progress
    detailProgressWrap: { paddingHorizontal: 16, marginBottom: 8 },
    detailProgressBar: { height: 8, backgroundColor: '#2A3A4A', borderRadius: 4, overflow: 'hidden' },
    detailProgressFill: { height: 8, backgroundColor: '#10B981', borderRadius: 4 },
    detailProgressText: { color: '#8899AA', fontSize: 12, marginTop: 4, textAlign: 'right' },

    // Scan row
    scanRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#1F2937', borderRadius: 12, marginHorizontal: 16, marginBottom: 8,
        padding: 4, paddingLeft: 12,
    },
    scanInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    scanIcon: { marginRight: 6, fontSize: 16 },
    scanInput: { flex: 1, fontSize: 16, color: '#F9FAFB', paddingVertical: 10 },
    cameraBtn: { padding: 8 },
    cameraIcon: { fontSize: 20 },
    scanBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    scanBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    btnDisabled: { backgroundColor: '#1E3A5F', opacity: 0.6 },

    // Action bar
    actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
    workerText: { color: '#8899AA', fontSize: 13, flex: 1 },
    reassignBtn: { backgroundColor: '#1A3A5C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    reassignText: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },

    // Table
    tableContent: { paddingHorizontal: 16, paddingBottom: 16 },
    tableHeaders: {
        flexDirection: 'row', backgroundColor: '#0F1923',
        paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#2A3A4A',
    },
    tableHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    colProduct: { flex: 5, minWidth: 0 },
    colBatch: { flex: 2, minWidth: 0 },
    colQty: { width: 44, textAlign: 'center' },
    colPicked: { width: 52, textAlign: 'right' },

    tableRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2332',
        borderWidth: 1, borderColor: '#2A3A4A', borderRadius: 10,
        paddingVertical: 10, paddingHorizontal: 10, marginBottom: 8,
    },
    tableRowChild: { backgroundColor: '#111B28', marginTop: -4, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
    tableCell: { justifyContent: 'center' },
    tableName: { color: '#E0E8F0', fontSize: 13, fontWeight: '700', flexShrink: 1 },
    tableSku: { color: '#667788', fontSize: 10, marginTop: 1 },
    tableBin: { color: '#60A5FA', fontSize: 10, marginTop: 2 },
    tableBatch: { color: '#8899AA', fontSize: 11 },
    tableQty: { color: '#B0C4D8', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    serialText: { color: '#E0E8F0', fontSize: 11, fontFamily: 'monospace' },
    serialMeta: { color: '#8899AA', fontSize: 10 },

    // Footer
    footer: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 24 },
    footerCancelBtn: { flex: 1, borderWidth: 1, borderColor: '#EF4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    footerCancelText: { color: '#EF4444', fontWeight: '600' },
    footerCompleteBtn: { flex: 2, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    footerCompleteText: { color: '#fff', fontWeight: '700' },

    // Scanner
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scannerCloseBtn: { position: 'absolute', top: 50, right: 20, backgroundColor: '#1F2937', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    closeIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },

    // Reassign modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalContent: { backgroundColor: '#1A2332', borderRadius: 14, padding: 18 },
    modalTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 12 },
    workerRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
    workerName: { color: '#E0E8F0', fontSize: 14, fontWeight: '600' },
    workerMeta: { color: '#8899AA', fontSize: 11, marginTop: 2 },
    modalCancelBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
    modalCancelText: { color: '#8899AA', fontSize: 14 },
});

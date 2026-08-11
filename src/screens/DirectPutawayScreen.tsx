// ============================================================
// Direct Put-Away Screen
// Phase 1: Scan QSeal (parent) or item QR
// Phase 2: Assign to bins — Inbound Summary-style table
// ============================================================
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as binService from '../api/binService';
import * as qsealService from '../api/qsealService';
import QrScanner from '../components/QrScanner';
import type { QSealParentWithUnits } from '../types';

// ── Table row types ──
interface TableRow {
  key: string;
  type: 'qseal-parent' | 'qseal-child' | 'scanned-item';
  productName: string;
  sku: string;
  batchNumber: string;
  itemCount: number;
  depth: number;
  parentKey?: string;
  isExpandable: boolean;
  assigned: boolean;
  assignedBin?: string;
  itemId?: string; // for API calls
}

type ViewState = 'scanning' | 'assign';

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse, user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  // ── Scanning ──
  const [viewState, setViewState] = useState<ViewState>('scanning');
  const [scannedParents, setScannedParents] = useState<QSealParentWithUnits[]>([]);
  const [lastScanFeedback, setLastScanFeedback] = useState<string | null>(null);
  const [isProcessingQSeal, setIsProcessingQSeal] = useState(false);

  // ── Bin input ──
  const [binId, setBinId] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ── Assign state ──
  const [assigning, setAssigning] = useState(false);

  // ── Counts ──
  const boxCount = scannedParents.length;
  const itemCount = scannedParents.reduce((s, p) => s + (p.linked_units?.length || 0), 0);

  // ================================================================
  // Build table rows (same pattern as Inbound Session Summary)
  // ================================================================
  const buildTableRows = (): TableRow[] => {
    const rows: TableRow[] = [];
    scannedParents.forEach((parent) => {
      const units = parent.linked_units || [];
      const firstUnit = units[0];
      const parentKey = `parent-${parent.id}`;

      rows.push({
        key: parentKey,
        type: 'qseal-parent',
        productName: firstUnit?.product_name || parent.name || 'Unknown',
        sku: firstUnit?.product_sku || '-',
        batchNumber: firstUnit?.dispatch_batch || '-',
        itemCount: units.length,
        depth: 0,
        isExpandable: units.length > 0,
        assigned: scannedParents.find((p) => `parent-${p.id}` === parentKey && (p as any)._assigned) ? true : false,
        assignedBin: (parent as any)._assignedBin,
      });

      units.forEach((unit) => {
        const childKey = `child-${unit.id}`;
        rows.push({
          key: childKey,
          type: 'qseal-child',
          productName: unit.serial_number || '-',
          sku: unit.product_sku || '-',
          batchNumber: unit.dispatch_batch || '-',
          itemCount: 1,
          depth: 1,
          parentKey,
          isExpandable: false,
          assigned: (unit as any)._assigned || false,
          assignedBin: (unit as any)._assignedBin,
          itemId: unit.product_item_id || unit.id,
        });
      });
    });
    return rows;
  };

  const toggleExpand = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ================================================================
  // QSeal URL detection
  // ================================================================
  const extractQSealSerial = (qrData: string): string | null => {
    const trimmed = qrData.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);
      const qIdx = parts.indexOf('qseal');
      if (qIdx !== -1 && qIdx + 1 < parts.length) return parts[qIdx + 1];
      const sIdx = parts.indexOf('s');
      if (sIdx !== -1 && sIdx + 1 < parts.length) return parts[sIdx + 1];
    } catch {}
    return null;
  };

  // ================================================================
  // QSeal scan
  // ================================================================
  const handleQSealScan = async (serial: string) => {
    if (!orgId) { Alert.alert('Error', 'Organization not found.'); return; }
    setIsProcessingQSeal(true);
    try {
      const node = await qsealService.scanQSeal(orgId, {
        serial_number: serial, device_type: 'mobile', os: 'iOS/Android', ip_address: '',
      });
      const parent = await qsealService.getLinkedUnits(node.node_id);
      const units = parent.linked_units || [];
      setScannedParents((prev) => [...prev, parent]);
      setLastScanFeedback(`📦 "${parent.name || serial}" — ${units.length} item(s)`);
    } catch (err: any) {
      const d = err?.response?.data?.detail || err?.message || 'Failed';
      Alert.alert('QSeal Error', typeof d === 'string' ? d : d?.message || 'Failed');
    } finally {
      setIsProcessingQSeal(false);
    }
  };

  // ================================================================
  // Item scan (non-QSeal)
  // ================================================================
  const handleItemScan = async (data: string) => {
    const scanned = data.trim();
    if (!scanned || !selectedWarehouse) return;
    try {
      const item = await binService.lookupItemBySku(scanned, selectedWarehouse.id);
      if (!item) { Alert.alert('Not Found', `No item found for "${scanned}".`); return; }
      setLastScanFeedback(`✅ ${item.name || item.sku}`);
      // Note: standalone items (not from QSeal) are not added to the table for now
      // The table is built from scannedParents (QSeal boxes)
      Alert.alert('Info', `Item "${item.name || item.sku}" found. Scan a QSeal box for batch put-away.`);
    } catch {
      Alert.alert('Error', 'Lookup failed.');
    }
  };

  const handleScan = useCallback(
    async (data: string) => {
      const serial = extractQSealSerial(data);
      if (serial) await handleQSealScan(serial);
      else await handleItemScan(data);
    },
    [orgId, selectedWarehouse]
  );

  // ================================================================
  // Assign single item
  // ================================================================
  const assignSingle = async (row: TableRow) => {
    const bid = binId.trim();
    if (!bid) { Alert.alert('Error', 'Enter a bin ID first.'); return; }
    if (!selectedWarehouse) return;

    setAssigning(true);
    try {
      // Lookup item
      const sku = row.sku !== '-' ? row.sku : '';
      if (!sku) { Alert.alert('Error', 'No SKU for this item.'); setAssigning(false); return; }
      const item = await binService.lookupItemBySku(sku, selectedWarehouse.id);
      if (!item) { Alert.alert('Error', 'Item not found in system.'); setAssigning(false); return; }
      await binService.addStockToBin({
        bin_id: bid,
        item_id: item.item_id,
        quantity: row.itemCount,
        batch_number: row.batchNumber !== '-' ? row.batchNumber : undefined,
      });

      // Mark parent as assigned
      if (row.type === 'qseal-parent') {
        setScannedParents((prev) =>
          prev.map((p) => {
            const pk = `parent-${p.id}`;
            if (pk === row.key) return { ...p, _assigned: true, _assignedBin: bid } as any;
            // Also mark children
            if ((p.linked_units || []).some((u) => `child-${u.id}` === row.key || `parent-${p.id}` === row.parentKey)) {
              const updatedUnits = (p.linked_units || []).map((u) => {
                if (row.type === 'qseal-parent' || `child-${u.id}` === row.key) {
                  return { ...u, _assigned: true, _assignedBin: bid } as any;
                }
                return u;
              });
              return { ...p, linked_units: updatedUnits, _assigned: false } as any;
            }
            return p;
          })
        );
      }

      Alert.alert('Done', `${row.productName} → ${bid}`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed.');
    } finally {
      setAssigning(false);
    }
  };

  // ================================================================
  // Assign ALL pending to bin
  // ================================================================
  const assignAll = async () => {
    const bid = binId.trim();
    if (!bid) { Alert.alert('Error', 'Enter a bin ID first.'); return; }
    if (!selectedWarehouse) return;

    const rows = buildTableRows();
    const allRows = rows.filter((r) => !r.assigned || !(r as any)?._assigned);

    // Flatten: for parents, assign all children; for standalone children, assign individually
    const toAssign: { row: TableRow; sku: string; batch: string; qty: number }[] = [];
    for (const row of rows) {
      if (row.type === 'qseal-parent' && !row.assigned && row.isExpandable) {
        // Assign children individually
        const children = rows.filter((r) => r.parentKey === row.key && !r.assigned);
        for (const child of children) {
          toAssign.push({ row: child, sku: child.sku, batch: child.batchNumber, qty: child.itemCount });
        }
      }
    }

    if (toAssign.length === 0) { Alert.alert('Info', 'No pending items.'); return; }

    setAssigning(true);
    let done = 0;
    for (const t of toAssign) {
      if (t.sku === '-' || !t.sku) continue;
      try {
        const item = await binService.lookupItemBySku(t.sku, selectedWarehouse.id);
        if (!item) continue;
        await binService.addStockToBin({
          bin_id: bid,
          item_id: item.item_id,
          quantity: t.qty,
          batch_number: t.batch !== '-' ? t.batch : undefined,
        });
        done++;
      } catch {}
    }

    // Mark all as assigned
    setScannedParents((prev) =>
      prev.map((p) => ({ ...p, _assigned: true, _assignedBin: bid, linked_units: (p.linked_units || []).map((u) => ({ ...u, _assigned: true, _assignedBin: bid })) }) as any)
    );

    Alert.alert('Done', `${done} item(s) → ${bid}`);
    setAssigning(false);
  };

  // ================================================================
  // RENDER: SCANNING
  // ================================================================
  if (viewState === 'scanning') {
    return (
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Direct Put-Away</Text>
          </View>
          {scannedParents.length > 0 && (
            <View style={styles.scanCount}>
              <Text style={styles.scanCountNum}>{scannedParents.length}</Text>
              <Text style={styles.scanCountLabel}>boxes</Text>
            </View>
          )}
        </View>

        {/* Scanner */}
        <QrScanner
          onScan={handleScan}
          title="Scan QSeal Box QR"
          subtitle="Scan parent QSeal to capture all items for put-away"
        />

        {/* Processing */}
        {isProcessingQSeal && (
          <View style={styles.processingBar}>
            <ActivityIndicator size="small" color="#1A73E8" />
            <Text style={styles.processingText}>Fetching linked units...</Text>
          </View>
        )}

        {/* Count bar */}
        {scannedParents.length > 0 && (
          <View style={styles.countBar}>
            <Text style={styles.countText}>
              📦 {boxCount} box{boxCount > 1 ? 'es' : ''} · 📋 {itemCount} item{itemCount !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Last scan */}
        {lastScanFeedback && (
          <View style={styles.lastScanToast}>
            <Text style={styles.lastScanText}>{lastScanFeedback}</Text>
          </View>
        )}

        {/* Action buttons */}
        {scannedParents.length > 0 && (
          <View style={styles.scanActions}>
            <TouchableOpacity
              style={styles.viewAssignButton}
              onPress={() => setViewState('assign')}
            >
              <Text style={styles.viewAssignButtonText}>
                Assign to Bins ({itemCount} items)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                Alert.alert('Clear All', 'Remove all scanned boxes?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => { setScannedParents([]); setLastScanFeedback(null); } },
                ]);
              }}
            >
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ================================================================
  // RENDER: ASSIGN (Inbound Summary-style table)
  // ================================================================
  const rows = buildTableRows();

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setViewState('scanning')} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Assign to Bins</Text>
          <Text style={styles.topBarSub}>{boxCount} boxes · {itemCount} items</Text>
        </View>
      </View>

      <ScrollView style={styles.assignScroll} contentContainerStyle={styles.assignContent}>
        {/* ── TOP: Bin input + Assign All ── */}
        <View style={styles.binInputSection}>
          <Text style={styles.sectionLabel}>Bin Location</Text>
          <View style={styles.binInputRow}>
            <TextInput
              style={styles.binInput}
              placeholder="Enter or scan bin ID"
              placeholderTextColor="#667788"
              value={binId}
              onChangeText={setBinId}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.binActionButton, !binId.trim() ? styles.binActionScan : styles.binActionAssign]}
              onPress={binId.trim() ? assignAll : () => {
                // In production: open bin QR scanner. For now: prompt
                Alert.prompt
                  ? Alert.prompt('Scan Bin', 'Enter bin ID:', (id) => { if (id?.trim()) setBinId(id.trim()); })
                  : Alert.alert('Scan Bin', 'Enter bin ID manually or use camera.', [{ text: 'OK' }]);
              }}
              disabled={assigning}
            >
              {assigning ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.binActionText}>
                  {binId.trim() ? 'Assign All' : '📷 Scan'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── TABLE (Inbound Session Summary style) ── */}
        <View style={styles.table}>
          {/* Column headers */}
          <View style={styles.colHeaders}>
            <Text style={[styles.colHeader, styles.colProduct]}>Product / SKU</Text>
            <Text style={[styles.colHeader, styles.colBatch]}>Batch</Text>
            <Text style={[styles.colHeader, styles.colBoxes]}>Qty</Text>
            <Text style={[styles.colHeader, styles.colAction]}>Action</Text>
          </View>

          {(() => {
            const visible = rows.filter((r) => {
              if (r.depth === 0) return true;
              return r.parentKey && expandedRows.has(r.parentKey);
            });
            if (visible.length === 0) {
              return (
                <View style={styles.emptyTable}>
                  <Text style={styles.emptyTableText}>No items scanned yet</Text>
                </View>
              );
            }
            return visible.map((row) => {
              const isChild = row.depth > 0;
              const isExpanded = row.isExpandable && expandedRows.has(row.key);

              return (
                <TouchableOpacity
                  key={row.key}
                  style={[styles.row, isChild && styles.rowChild, row.assigned && styles.rowAssigned]}
                  activeOpacity={row.isExpandable ? 0.7 : 1}
                  onPress={() => row.isExpandable && toggleExpand(row.key)}
                  disabled={!row.isExpandable}
                >
                  {/* Product/SKU */}
                  <View style={[styles.cell, styles.colProduct]}>
                    {isChild ? (
                      <Text style={styles.childSerial} numberOfLines={1}>
                        {'  └ '}{row.productName}
                      </Text>
                    ) : (
                      <>
                        <Text style={styles.productName} numberOfLines={1}>
                          {row.isExpandable ? (isExpanded ? '▼ ' : '▶ ') : ''}{row.productName}
                        </Text>
                        <Text style={styles.productSku}>{row.sku}</Text>
                      </>
                    )}
                  </View>

                  {/* Batch */}
                  <View style={[styles.cell, styles.colBatch]}>
                    <Text style={styles.batchText} numberOfLines={1}>{row.batchNumber}</Text>
                  </View>

                  {/* Qty */}
                  <View style={[styles.cell, styles.colBoxes]}>
                    <Text style={styles.qtyText}>{row.itemCount}</Text>
                  </View>

                  {/* Action: Assign */}
                  <View style={[styles.cell, styles.colAction]}>
                    {row.assigned ? (
                      <View style={styles.assignedBadge}>
                        <Text style={styles.assignedBadgeText}>✓</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.assignBtn}
                        onPress={() => {
                          Alert.alert(
                            'Assign to Bin',
                            `Put "${row.productName}" (×${row.itemCount}) into ${binId.trim() || '(no bin set)'}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Assign', onPress: () => assignSingle(row) },
                            ]
                          );
                        }}
                        disabled={assigning}
                      >
                        <Text style={styles.assignBtnText}>Assign</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            });
          })()}
        </View>

        {/* ── Back to scan ── */}
        <TouchableOpacity style={styles.backToScanBtn} onPress={() => setViewState('scanning')}>
          <Text style={styles.backToScanText}>📷 Back to Scanning</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ================================================================
// STYLES
// ================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 55, paddingBottom: 12,
    paddingHorizontal: 16, backgroundColor: '#1A2332', gap: 12, zIndex: 10,
  },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A3A4A', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#8899AA', fontSize: 16, fontWeight: '700' },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  topBarSub: { color: '#8899AA', fontSize: 12, marginTop: 2 },
  scanCount: { backgroundColor: '#1A73E8', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center' },
  scanCountNum: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scanCountLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },

  // Processing
  processingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, backgroundColor: 'rgba(26,115,232,0.1)', gap: 8 },
  processingText: { color: '#1A73E8', fontSize: 13 },

  // Count bar
  countBar: { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  countText: { color: '#10B981', fontSize: 14, fontWeight: '600' },

  // Last scan
  lastScanToast: { backgroundColor: 'rgba(26,35,50,0.95)', paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  lastScanText: { color: '#B0C4D8', fontSize: 13 },

  // Scan actions
  scanActions: { flexDirection: 'row', padding: 16, gap: 10 },
  viewAssignButton: { flex: 2, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  viewAssignButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  clearButton: { flex: 1, backgroundColor: '#374151', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  clearButtonText: { color: '#9CA3AF', fontSize: 15, fontWeight: '500' },

  // ── Assign view ──
  assignScroll: { flex: 1 },
  assignContent: { padding: 16, paddingBottom: 60 },

  // Bin input section
  binInputSection: { marginBottom: 16 },
  sectionLabel: { color: '#8899AA', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  binInputRow: { flexDirection: 'row', gap: 10 },
  binInput: {
    flex: 1, backgroundColor: '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: '#2A3A4A',
    color: '#fff', fontSize: 16, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  binActionButton: { borderRadius: 10, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', minWidth: 110 },
  binActionScan: { backgroundColor: '#1A73E8' },
  binActionAssign: { backgroundColor: '#10B981' },
  binActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Table (matching Inbound Summary) ──
  table: { backgroundColor: '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: '#2A3A4A', overflow: 'hidden', marginBottom: 16 },
  colHeaders: { flexDirection: 'row', backgroundColor: '#0F1923', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
  colHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  colProduct: { flex: 5, minWidth: 0 },
  colBatch: { flex: 2, minWidth: 0 },
  colBoxes: { width: 40, alignItems: 'center' as const },
  colAction: { width: 68, alignItems: 'flex-end' as const },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#0F1923' },
  rowChild: { backgroundColor: '#0F1923', paddingLeft: 6 },
  rowAssigned: { opacity: 0.5, backgroundColor: 'rgba(16,185,129,0.08)' },

  cell: { justifyContent: 'center' },
  productName: { color: '#E0E8F0', fontSize: 12, fontWeight: '700' },
  childSerial: { color: '#8899AA', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  productSku: { color: '#667788', fontSize: 10, marginTop: 1 },
  batchText: { color: '#8899AA', fontSize: 11 },
  qtyText: { color: '#B0C4D8', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // Assign button
  assignBtn: { backgroundColor: '#1A73E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  assignBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  assignedBadge: { backgroundColor: '#10B981', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  assignedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Empty
  emptyTable: { padding: 30, alignItems: 'center' },
  emptyTableText: { color: '#667788', fontSize: 14 },

  // Back to scan
  backToScanBtn: { backgroundColor: '#1A3A5C', borderRadius: 10, padding: 16, alignItems: 'center' },
  backToScanText: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },
});

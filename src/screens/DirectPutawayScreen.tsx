// ============================================================
// Direct Put-Away — Inbound-style scanning + Summary-style table
// Scan QSeal boxes → View & Assign with table (Assign not Reject)
// ============================================================
import React, { useState, useCallback, useRef } from 'react';
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
import * as putawayService from '../api/putawayService';
import * as qsealService from '../api/qsealService';
import QrScanner from '../components/QrScanner';
import type { TrackingItem } from '../types';

// ── Table row types (same pattern as Inbound Summary) ──
interface TableRow {
  key: string;
  type: 'box' | 'child';
  productName: string;
  sku: string;
  batchNumber: string;
  itemCount: number;
  serial: string;
  tracking: TrackingItem | null;
  status: 'pending' | 'assigned' | 'already-done' | 'rejected' | 'not-found';
  isExpandable: boolean;
}

type Step = 'scanning' | 'assign';

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse, user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  const [step, setStep] = useState<Step>('scanning');
  const [rows, setRows] = useState<TableRow[]>([]);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannedSerials, setScannedSerials] = useState<Set<string>>(new Set());

  // Assign view
  const [binId, setBinId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const scanLockRef = useRef(false);

  // Counts
  const boxCount = rows.filter((r) => r.type === 'box').length;
  const childCount = rows.filter((r) => r.type === 'child').length;
  const assignedCount = rows.filter((r) => r.status === 'assigned').length;

  // ================================================================
  // Extract serial from URL
  // ================================================================
  const extractSerial = (data: string): string | null => {
    const t = data.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) {
      try {
        const parts = new URL(t).pathname.split('/').filter(Boolean);
        const qIdx = parts.indexOf('qseal');
        if (qIdx !== -1 && qIdx + 1 < parts.length) return parts[qIdx + 1];
        const sIdx = parts.indexOf('s');
        if (sIdx !== -1 && sIdx + 1 < parts.length) return parts[sIdx + 1];
      } catch {}
      return null;
    }
    return t;
  };

  // ================================================================
  // Handle scan
  // ================================================================
  const handleScan = useCallback(
    async (data: string) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setErrorMsg(null);

      const serial = extractSerial(data);
      if (!serial) { scanLockRef.current = false; return; }
      if (scannedSerials.has(serial)) {
        setErrorMsg(`Already scanned: ${serial}`);
        scanLockRef.current = false;
        return;
      }

      const isQSealUrl = data.trim().startsWith('http');
      if (isQSealUrl && orgId) await processParent(serial);
      else await processChild(serial);

      scanLockRef.current = false;
    },
    [orgId, scannedSerials]
  );

  // ================================================================
  // Parent QSeal scan
  // ================================================================
  const processParent = async (serial: string) => {
    if (!orgId) return;
    setIsProcessing(true);
    try {
      const node = await qsealService.scanQSeal(orgId, {
        serial_number: serial, device_type: 'mobile', os: 'iOS/Android', ip_address: '',
      });
      const parent = await qsealService.getLinkedUnits(node.node_id);
      const units = parent.linked_units || [];

      setScannedSerials((prev) => new Set(prev).add(serial));

      // Box row
      const boxKey = `box-${node.node_id}`;
      const newRows: TableRow[] = [{
        key: boxKey, type: 'box',
        productName: parent.name || serial,
        sku: units[0]?.product_sku || '-',
        batchNumber: units[0]?.dispatch_batch || '-',
        itemCount: units.length,
        serial, tracking: null, status: 'pending', isExpandable: true,
      }];

      // Child rows (lookup tracking for each)
      for (const unit of units) {
        let status: TableRow['status'] = 'not-found';
        let tracking: TrackingItem | null = null;
        try {
          tracking = await putawayService.lookupTrackingByQr(unit.serial_number);
          if (!tracking) status = 'not-found';
          else if (tracking.putaway_status === 'completed') status = 'already-done';
          else if (tracking.receiving_status === 'rejected') status = 'rejected';
          else status = 'pending';
        } catch { status = 'not-found'; }

        newRows.push({
          key: `child-${unit.id}`, type: 'child',
          productName: unit.serial_number,
          sku: unit.product_sku || '-',
          batchNumber: unit.serial_number,
          itemCount: 1,
          serial: unit.serial_number,
          tracking, status, isExpandable: false,
        });
      }

      setRows((prev) => [...prev, ...newRows]);
      setLastFeedback(`📦 "${parent.name || serial}" — ${units.length} item(s)`);
    } catch (err: any) {
      const d = err?.response?.data?.detail || err?.message || 'Failed';
      setErrorMsg(typeof d === 'string' ? d : d?.message || 'Failed');
    } finally { setIsProcessing(false); }
  };

  // ================================================================
  // Individual item scan (non-QSeal URL)
  // ================================================================
  const processChild = async (serial: string) => {
    setScannedSerials((prev) => new Set(prev).add(serial));
    let status: TableRow['status'] = 'not-found';
    let tracking: TrackingItem | null = null;
    try {
      tracking = await putawayService.lookupTrackingByQr(serial);
      if (!tracking) status = 'not-found';
      else if (tracking.putaway_status === 'completed') status = 'already-done';
      else if (tracking.receiving_status === 'rejected') status = 'rejected';
      else status = 'pending';
    } catch { status = 'not-found'; }

    setRows((prev) => [...prev, {
      key: `item-${Date.now()}`, type: 'child',
      productName: serial, sku: tracking?.sku || '-',
      batchNumber: serial, itemCount: 1,
      serial, tracking, status, isExpandable: false,
    }]);
    setLastFeedback(status === 'pending' ? `✅ ${tracking?.sku || serial}` : `⚠️ ${serial} — ${status}`);
  };

  // ================================================================
  // Assign single item
  // ================================================================
  const assignSingle = async (row: TableRow) => {
    const bid = binId.trim();
    if (!bid) { Alert.alert('Error', 'Enter a bin ID first.'); return; }
    if (row.status !== 'pending' || !row.tracking) return;

    try {
      await putawayService.completePutawayByQr({ qr: row.serial, bin_id: bid as any, quantity: row.tracking.quantity });
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'assigned' as const } : r)));
    } catch (err: any) { Alert.alert('Error', err.response?.data?.detail || 'Failed.'); }
  };

  // ================================================================
  // Assign all pending children
  // ================================================================
  const assignAll = async () => {
    const bid = binId.trim();
    if (!bid) { Alert.alert('Error', 'Enter a bin ID first.'); return; }
    const pending = rows.filter((r) => r.status === 'pending' && r.tracking);
    if (pending.length === 0) { Alert.alert('Info', 'No pending items.'); return; }

    setIsAssigning(true);
    let done = 0;
    for (const r of pending) {
      try {
        await putawayService.completePutawayByQr({ qr: r.serial, bin_id: bid as any, quantity: r.tracking!.quantity });
        setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, status: 'assigned' as const } : x)));
        done++;
      } catch {}
    }
    setIsAssigning(false);
    Alert.alert('Done', `${done}/${pending.length} items → ${bid}`);
  };

  const toggleExpand = (key: string) => {
    setExpandedBoxes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ================================================================
  // RENDER: SCANNING (Inbound-style)
  // ================================================================
  if (step === 'scanning') {
    const pendingCount = rows.filter((r) => r.status === 'pending').length;

    return (
      <View style={styles.container}>
        {/* Session bar */}
        <View style={styles.sessionBar}>
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionLabel}>Direct Put-Away</Text>
            <Text style={styles.sessionDock}>{selectedWarehouse?.name || ''}</Text>
          </View>
          <View style={styles.scanCount}>
            <Text style={styles.scanCountNum}>{boxCount}</Text>
            <Text style={styles.scanCountLabel}>boxes</Text>
          </View>
        </View>

        {/* Scanner */}
        <QrScanner
          onScan={handleScan}
          title="Scan QSeal Box or Item QR"
          subtitle="Scan parent QSeal to capture all items"
        />

        {/* Processing */}
        {isProcessing && (
          <View style={styles.linkedUnitsLoading}>
            <ActivityIndicator size="small" color="#1A73E8" />
            <Text style={styles.linkedUnitsLoadingText}>Fetching linked units...</Text>
          </View>
        )}

        {/* Error */}
        {errorMsg && (
          <View style={styles.errorToast}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => setErrorMsg(null)}><Text style={styles.errorDismiss}>✕</Text></TouchableOpacity>
          </View>
        )}

        {/* Last scan */}
        {lastFeedback && (
          <View style={styles.lastScanToast}>
            <Text style={styles.lastScanText}>{lastFeedback}</Text>
          </View>
        )}

        {/* Count bar */}
        {rows.length > 0 && (
          <View style={styles.qsealCountBar}>
            <Text style={styles.qsealCountText}>
              📦 {boxCount} box{boxCount !== 1 ? 'es' : ''} · 📋 {childCount} item{childCount !== 1 ? 's' : ''}
              {assignedCount > 0 && ` · ✅ ${assignedCount} done`}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {rows.length > 0 && (
          <View style={styles.scanActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('assign')}>
              <Text style={styles.secondaryButtonText}>View & Assign ({pendingCount} pending)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.endButton} onPress={() => {
              Alert.alert('Clear All', 'Remove all scanned items?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => { setRows([]); setLastFeedback(null); } },
              ]);
            }}>
              <Text style={styles.endButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ================================================================
  // RENDER: ASSIGN (Inbound Summary-style table)
  // ================================================================
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.summaryHeader}>
        <TouchableOpacity onPress={() => setStep('scanning')}>
          <Text style={styles.backBtn}>← Scanning</Text>
        </TouchableOpacity>
        <Text style={styles.summaryTitle}>Assign to Bins</Text>
        <Text style={styles.summarySub}>{boxCount} boxes · {childCount} items · {assignedCount} done</Text>
      </View>

      <ScrollView style={styles.assignScroll} contentContainerStyle={styles.assignContent}>
        {/* Bin input + Assign All */}
        <View style={styles.binSection}>
          <Text style={styles.binLabel}>BIN LOCATION</Text>
          <View style={styles.binRow}>
            <TextInput
              style={styles.binInput}
              placeholder="Enter or scan bin ID"
              placeholderTextColor="#667788"
              value={binId}
              onChangeText={setBinId}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.assignAllBtn, !binId.trim() && styles.assignAllBtnDisabled]}
              onPress={assignAll}
              disabled={!binId.trim() || isAssigning}
            >
              {isAssigning ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.assignAllBtnText}>Assign All</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── TABLE (Inbound Summary style) ── */}
        <View style={styles.table}>
          <View style={styles.colHeaders}>
            <Text style={[styles.colHeader, styles.colProduct]}>Product / SKU</Text>
            <Text style={[styles.colHeader, styles.colBatch]}>Batch</Text>
            <Text style={[styles.colHeader, styles.colBoxes]}>Qty</Text>
            <Text style={[styles.colHeader, styles.colAction]}>Action</Text>
          </View>

          {rows.filter((r) => {
            if (r.type === 'box') return true;
            // Child visible only if parent expanded
            const parentKey = `box-${r.key.split('-').slice(1).join('-')}`;
            // Actually find the parent by checking if any box row key matches the child's serial parent
            const parent = rows.find((x) => x.type === 'box' && r.key.startsWith('child-') && rows.indexOf(x) < rows.indexOf(r) && rows.slice(0, rows.indexOf(r)).reverse().find(y => y.type === 'box')?.key === x.key);
            // Simpler: children are visible if their preceding box is expanded
            return true; // Show all for simplicity
          }).filter((r, idx, arr) => {
            if (r.type === 'box') return true;
            // Find nearest preceding box
            for (let i = idx - 1; i >= 0; i--) {
              if (arr[i].type === 'box') return expandedBoxes.has(arr[i].key);
            }
            return true;
          }).map((row) => {
            const isChild = row.type === 'child';
            const isExpanded = row.isExpandable && expandedBoxes.has(row.key);

            return (
              <TouchableOpacity
                key={row.key}
                style={[styles.row, isChild && styles.rowChild, row.status === 'assigned' && styles.rowAssigned]}
                activeOpacity={row.isExpandable ? 0.7 : 1}
                onPress={() => row.isExpandable && toggleExpand(row.key)}
                disabled={!row.isExpandable}
              >
                {/* Product / SKU */}
                <View style={[styles.cell, styles.colProduct]}>
                  {isChild ? (
                    <Text style={styles.childSerial} numberOfLines={1}>{'  └ '}{row.productName}</Text>
                  ) : (
                    <>
                      <Text style={styles.productName} numberOfLines={1}>
                        {isExpanded ? '▼ ' : '▶ '}{row.productName}
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

                {/* Action: Assign (instead of Reject) */}
                <View style={[styles.cell, styles.colAction]}>
                  {row.status === 'assigned' || row.status === 'already-done' ? (
                    <View style={styles.assignedBadge}><Text style={styles.assignedBadgeText}>✓</Text></View>
                  ) : row.status === 'rejected' ? (
                    <View style={styles.rejectedBadge}><Text style={styles.rejectedBadgeText}>🚫</Text></View>
                  ) : row.status === 'not-found' ? (
                    <Text style={styles.notFoundText}>—</Text>
                  ) : row.type === 'box' ? null : (
                    <TouchableOpacity style={styles.assignBtn} onPress={() => assignSingle(row)}>
                      <Text style={styles.assignBtnText}>Assign</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Resume Scanning */}
      <View style={styles.scanActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('scanning')}>
          <Text style={styles.secondaryButtonText}>Resume Scanning</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ================================================================
// STYLES — matching InboundScreen
// ================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },

  // ── Session bar (Inbound style) ──
  sessionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 55, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#1A2332',
  },
  sessionInfo: { flex: 1 },
  sessionLabel: { color: '#1A73E8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  sessionDock: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 2 },
  scanCount: { backgroundColor: '#1A73E8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
  scanCountNum: { color: '#fff', fontSize: 18, fontWeight: '700' },
  scanCountLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },

  // ── Processing / Feedback / Count bars ──
  linkedUnitsLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: 'rgba(26,115,232,0.1)', gap: 8 },
  linkedUnitsLoadingText: { color: '#8899AA', fontSize: 13 },
  errorToast: { marginHorizontal: 16, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center' },
  errorText: { color: '#FCA5A5', fontSize: 13, flex: 1 },
  errorDismiss: { color: '#FCA5A5', fontSize: 16, fontWeight: '700', paddingLeft: 12 },
  lastScanToast: { backgroundColor: 'rgba(26,35,50,0.95)', paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  lastScanText: { color: '#B0C4D8', fontSize: 13 },
  qsealCountBar: { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  qsealCountText: { color: '#10B981', fontSize: 14, fontWeight: '600' },

  // ── Scan actions ──
  scanActions: { flexDirection: 'row', padding: 16, gap: 10 },
  secondaryButton: { flex: 2, backgroundColor: '#1A2332', borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2A3A4A' },
  secondaryButtonText: { color: '#B0C4D8', fontSize: 15, fontWeight: '600' },
  endButton: { flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  endButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // ── Assign view header ──
  summaryHeader: { paddingTop: 55, paddingBottom: 16, paddingHorizontal: 16, backgroundColor: '#1A2332', borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
  backBtn: { color: '#1A73E8', fontSize: 15, fontWeight: '600', marginBottom: 8 },
  summaryTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  summarySub: { color: '#8899AA', fontSize: 13, marginTop: 4 },

  // ── Assign scroll ──
  assignScroll: { flex: 1 },
  assignContent: { padding: 16, paddingBottom: 40 },

  // ── Bin input ──
  binSection: { marginBottom: 16 },
  binLabel: { color: '#667788', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  binRow: { flexDirection: 'row', gap: 10 },
  binInput: { flex: 1, backgroundColor: '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: '#2A3A4A', color: '#fff', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  assignAllBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  assignAllBtnDisabled: { backgroundColor: '#374151' },
  assignAllBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Table (Inbound Summary style) ──
  table: { backgroundColor: '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: '#2A3A4A', overflow: 'hidden' },
  colHeaders: { flexDirection: 'row', backgroundColor: '#0F1923', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
  colHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  colProduct: { flex: 5, minWidth: 0 },
  colBatch: { flex: 2, minWidth: 0 },
  colBoxes: { width: 40, alignItems: 'center' as const },
  colAction: { width: 62, alignItems: 'flex-end' as const },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#0F1923' },
  rowChild: { backgroundColor: '#0F1923', paddingLeft: 6 },
  rowAssigned: { opacity: 0.5, backgroundColor: 'rgba(16,185,129,0.08)' },

  cell: { justifyContent: 'center' },
  productName: { color: '#E0E8F0', fontSize: 12, fontWeight: '700' },
  childSerial: { color: '#8899AA', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  productSku: { color: '#667788', fontSize: 10, marginTop: 1 },
  batchText: { color: '#8899AA', fontSize: 11 },
  qtyText: { color: '#B0C4D8', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // Assign button (instead of Reject)
  assignBtn: { backgroundColor: '#1A73E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  assignBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  assignedBadge: { backgroundColor: '#10B981', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  assignedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rejectedBadge: { backgroundColor: '#EF4444', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rejectedBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  notFoundText: { color: '#667788', fontSize: 12 },
});

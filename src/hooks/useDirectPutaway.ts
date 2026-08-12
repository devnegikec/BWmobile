// ============================================================
// useDirectPutaway — State + logic for Direct Put-Away flow
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import * as putawayService from '../api/putawayService';
import * as qsealService from '../api/qsealService';
import { extractSerial, isQSealUrl } from '../components/putaway/qrHelpers';
import type { TrackingItem } from '../types';

// ── Types ──
export interface TableRow {
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

export type Step = 'scanning' | 'assign';

export function useDirectPutaway(orgId: string) {
  // ── State ──
  const [step, setStep] = useState<Step>('scanning');
  const [rows, setRows] = useState<TableRow[]>([]);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannedSerials, setScannedSerials] = useState<Set<string>>(new Set());
  const [binId, setBinId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const scanLockRef = useRef(false);

  // ── Derived counts ──
  const boxCount = rows.filter((r) => r.type === 'box').length;
  const childCount = rows.filter((r) => r.type === 'child').length;
  const assignedCount = rows.filter((r) => r.status === 'assigned').length;
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  // ── Parent QSeal scan ──
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

      const boxKey = `box-${node.node_id}`;
      const newRows: TableRow[] = [{
        key: boxKey, type: 'box',
        productName: parent.name || serial,
        sku: units[0]?.product_sku || '-',
        batchNumber: units[0]?.dispatch_batch || '-',
        itemCount: units.length,
        serial, tracking: null, status: 'pending', isExpandable: true,
      }];

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
          itemCount: 1, serial: unit.serial_number,
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

  // ── Individual item scan ──
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

  // ── Main scan handler ──
  const handleScan = useCallback(async (data: string) => {
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

    if (isQSealUrl(data) && orgId) await processParent(serial);
    else await processChild(serial);

    scanLockRef.current = false;
  }, [orgId, scannedSerials]);

  // ── Assign row (box → all children, child → single) ──
  const assignRow = async (row: TableRow, bid: string) => {
    if (!bid.trim()) { Alert.alert('Error', 'Enter a bin ID first.'); return; }
    const bin = bid.trim();

    if (row.type === 'box') {
      const boxKey = row.key;
      const boxIdx = rows.findIndex((r) => r.key === boxKey);
      const after = rows.slice(boxIdx + 1);
      const nextBoxIdx = after.findIndex((r) => r.type === 'box');
      const boxChildren = (nextBoxIdx === -1 ? after : after.slice(0, nextBoxIdx))
        .filter((r) => r.type === 'child' && r.status === 'pending' && r.tracking);

      if (boxChildren.length === 0) { Alert.alert('Info', 'No pending items in this box.'); return; }

      setIsAssigning(true);
      let done = 0;
      for (const c of boxChildren) {
        try {
          await putawayService.completePutawayByQr({ qr: c.serial, bin_id: bin as any, quantity: c.tracking!.quantity });
          setRows((prev) => prev.map((x) => (x.key === c.key ? { ...x, status: 'assigned' as const } : x)));
          done++;
        } catch {}
      }
      setIsAssigning(false);
      Alert.alert('Done', `${done}/${boxChildren.length} items → ${bin}`);
    } else {
      if (row.status !== 'pending' || !row.tracking) return;
      try {
        await putawayService.completePutawayByQr({ qr: row.serial, bin_id: bin as any, quantity: row.tracking.quantity });
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'assigned' as const } : r)));
      } catch (err: any) { Alert.alert('Error', err.response?.data?.detail || 'Failed.'); }
    }
  };

  // ── Assign all pending ──
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

  // ── Toggle expand ──
  const toggleExpand = (key: string) => {
    setExpandedBoxes((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ── Clear all ──
  const clearAll = () => {
    setRows([]);
    setLastFeedback(null);
    setErrorMsg(null);
    setBinId('');
  };

  return {
    // State
    step, setStep, rows, expandedBoxes, isProcessing, lastFeedback,
    errorMsg, setErrorMsg, binId, setBinId, isAssigning,
    // Counts
    boxCount, childCount, assignedCount, pendingCount,
    // Actions
    handleScan, assignRow, assignAll, toggleExpand, clearAll,
  };
}

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

export function useDirectPutaway(orgId: string, warehouseId: string) {
  // ── State ──
  const [step, setStep] = useState<Step>('scanning');
  const [rows, setRows] = useState<TableRow[]>([]);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannedSerials, setScannedSerials] = useState<Set<string>>(new Set());
  const [isAssigning, setIsAssigning] = useState(false);
  const [directListId, setDirectListId] = useState<string | null>(null);

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

      setScannedSerials((prev) => {
        const next = new Set(prev).add(serial);
        // Mark every child serial as scanned too, so scanning a child again
        // won't create a second assignment row for the same item.
        for (const unit of units) {
          if (unit.serial_number) next.add(unit.serial_number);
        }
        return next;
      });

      const boxKey = `box-${node.node_id}`;
      const boxRow: TableRow = {
        key: boxKey, type: 'box',
        productName: parent.name || serial,
        sku: units[0]?.product_sku || '-',
        batchNumber: units[0]?.dispatch_batch || '-',
        itemCount: units.length,
        serial, tracking: null, status: 'pending', isExpandable: true,
      };

      const childRows = await Promise.all(
        units.map(async (unit): Promise<TableRow> => {
          let status: TableRow['status'] = 'not-found';
          let tracking: TrackingItem | null = null;
          try {
            tracking = await putawayService.lookupTrackingByQr(unit.serial_number);
            if (!tracking && warehouseId) {
              // No inbound scan exists — create the tracking row on the fly
              tracking = await putawayService.scanItemForPutaway({
                qr: unit.product_item_url || unit.serial_number,
                warehouse_id: warehouseId,
              });
            }
            console.log(
              '[DirectPutAway] lookup child', unit.serial_number, '->',
              tracking
                ? `putaway=${tracking.putaway_status} receiving=${tracking.receiving_status}`
                : 'NOT FOUND'
            );
            if (!tracking) status = 'not-found';
            else if (tracking.putaway_status === 'completed') status = 'already-done';
            else if (tracking.receiving_status === 'rejected') status = 'rejected';
            else status = 'pending';
          } catch { status = 'not-found'; }

          return {
            key: `child-${unit.id}`, type: 'child',
            productName: unit.serial_number,
            sku: unit.product_sku || '-',
            batchNumber: unit.serial_number,
            itemCount: 1, serial: unit.serial_number,
            tracking, status, isExpandable: false,
          };
        })
      );

      setRows((prev) => [...prev, boxRow, ...childRows]);
      setLastFeedback(`📦 "${parent.name || serial}" — ${units.length} item(s)`);
    } catch (err: any) {
      const d = err?.response?.data?.detail || err?.message || 'Failed';
      setErrorMsg(typeof d === 'string' ? d : d?.message || 'Failed');
    } finally { setIsProcessing(false); }
  };

  // ── Individual item scan ──
  const processChild = async (data: string, serial: string) => {
    setScannedSerials((prev) => new Set(prev).add(serial));
    let status: TableRow['status'] = 'not-found';
    let tracking: TrackingItem | null = null;
    try {
      tracking = await putawayService.lookupTrackingByQr(serial);
      if (!tracking && warehouseId) {
        // No inbound scan exists — create the tracking row on the fly
        tracking = await putawayService.scanItemForPutaway({
          qr: data,
          warehouse_id: warehouseId,
        });
      }
      console.log(
        '[DirectPutAway] lookup item', serial, '->',
        tracking
          ? `putaway=${tracking.putaway_status} receiving=${tracking.receiving_status}`
          : 'NOT FOUND'
      );
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
    else await processChild(data, serial);

    scanLockRef.current = false;
    // processParent/processChild intentionally omitted — they only read stable
    // orgId/warehouseId, which are already deps of this callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, warehouseId, scannedSerials]);

  // ── Ensure a direct put-away list exists for this session ──
  const ensureDirectList = async (): Promise<string | null> => {
    if (directListId) return directListId;
    if (!warehouseId) return null;
    try {
      const list = await putawayService.createDirectPutAwayList(warehouseId);
      setDirectListId(list.id);
      console.log('[DirectPutAway] created put-away list', list.id);
      return list.id;
    } catch (err) {
      console.log('[DirectPutAway] create put-away list FAILED', err);
      return null;
    }
  };

  // ── Assign row (box → all children, child → single) ──
  // locationId is the UUID from bin QR lookup
  const assignRow = async (row: TableRow, locationId: string) => {
    if (!locationId) { Alert.alert('Error', 'No bin location resolved.'); return; }
    console.log(
      '[DirectPutAway] assignRow key=', row.key, 'type=', row.type,
      'status=', row.status, 'bin=', locationId
    );
    const listId = await ensureDirectList();

    if (row.type === 'box') {
      const boxKey = row.key;
      const boxIdx = rows.findIndex((r) => r.key === boxKey);
      const after = rows.slice(boxIdx + 1);
      const nextBoxIdx = after.findIndex((r) => r.type === 'box');
      const boxChildren = (nextBoxIdx === -1 ? after : after.slice(0, nextBoxIdx))
        .filter((r) => r.type === 'child' && r.status === 'pending' && r.tracking);

      if (boxChildren.length === 0) { Alert.alert('Info', 'No pending items in this box.'); return; }

      setIsAssigning(true);
      const results = await Promise.allSettled(
        boxChildren.map(async (c) => {
          await putawayService.completePutawayByQr({
            qr: c.serial, bin_id: locationId, quantity: c.tracking!.quantity,
            put_away_list_id: listId || undefined,
          });
          setRows((prev) => prev.map((x) => (x.key === c.key ? { ...x, status: 'assigned' as const } : x)));
        })
      );
      const done = results.filter((r) => r.status === 'fulfilled').length;
      setIsAssigning(false);
      Alert.alert('Done', `${done}/${boxChildren.length} items assigned.`);
    } else {
      if (row.status !== 'pending' || !row.tracking) return;
      try {
        await putawayService.completePutawayByQr({
          qr: row.serial, bin_id: locationId, quantity: row.tracking.quantity,
          put_away_list_id: listId || undefined,
        });
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, status: 'assigned' as const } : r)));
      } catch (err: any) { Alert.alert('Error', err.response?.data?.detail || 'Failed.'); }
    }
  };

  // ── Assign all pending to a bin (locationId = UUID from bin lookup) ──
  const assignAll = async (locationId: string) => {
    if (!locationId) { Alert.alert('Error', 'No bin location resolved.'); return; }
    console.log(
      '[DirectPutAway] assignAll bin=', locationId,
      'rows=', JSON.stringify(
        rows.map((r) => ({
          key: r.key,
          type: r.type,
          serial: r.serial,
          status: r.status,
          hasTracking: !!r.tracking,
        }))
      )
    );
    const pending = rows.filter((r) => r.status === 'pending' && r.tracking);
    console.log('[DirectPutAway] assignAll pendingCount=', pending.length);
    if (pending.length === 0) { Alert.alert('Info', 'No pending items.'); return; }

    const listId = await ensureDirectList();

    setIsAssigning(true);
    const results = await Promise.allSettled(
      pending.map(async (r) => {
        await putawayService.completePutawayByQr({
          qr: r.serial, bin_id: locationId, quantity: r.tracking!.quantity,
          put_away_list_id: listId || undefined,
        });
        setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, status: 'assigned' as const } : x)));
      })
    );
    const done = results.filter((r) => r.status === 'fulfilled').length;
    setIsAssigning(false);
    Alert.alert('Done', `${done}/${pending.length} items assigned.`);
  };

  // ── Toggle expand ──
  const toggleExpand = (key: string) => {
    setExpandedBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ── Clear all ──
  const clearAll = () => {
    setRows([]);
    setLastFeedback(null);
    setErrorMsg(null);
    setDirectListId(null);
  };

  return {
    // State
    step, setStep, rows, expandedBoxes, isProcessing, lastFeedback,
    errorMsg, setErrorMsg, isAssigning,
    // Counts
    boxCount, childCount, assignedCount, pendingCount,
    // Actions
    handleScan, assignRow, assignAll, toggleExpand, clearAll,
  };
}

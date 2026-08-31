// ============================================================
// Assign Bin Screen — Single scanner, auto-detect bin vs item
// Flow: idle → scanning → review → submitting → success
// ============================================================
import React, { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import * as binService from '@/api/binService';
import { getBackendErrorMessage } from '@/utils/errors';
import IdleView from '@/components/assignBin/IdleView';
import ScanningView from '@/components/assignBin/ScanningView';
import ReviewView from '@/components/assignBin/ReviewView';
import SubmittingView from '@/components/assignBin/SubmittingView';
import SuccessView from '@/components/assignBin/SuccessView';
import type { BinInfo, ScannedItem } from '@/components/assignBin/types';

type ScreenPhase = 'idle' | 'scanning' | 'review' | 'submitting' | 'success';

// ============ QR Parsers (pure functions outside component) ============

function extractSkuFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // /g/{SKU}/... — e.g. https://pg.verify.example.com/g/IND-10023/s/UCYFQ8/...
    // SKU can be numeric (12350301) or alphanumeric with hyphens (IND-10023)
    const gIdx = pathParts.indexOf('g');
    if (gIdx !== -1 && gIdx + 1 < pathParts.length) {
      const candidate = pathParts[gIdx + 1];
      if (candidate && /^[\w-]+$/.test(candidate)) return candidate;
    }

    // Query param — ?sku=XXX, ?code=XXX, ?id=XXX
    const skuParam =
      urlObj.searchParams.get('sku') ||
      urlObj.searchParams.get('code') ||
      urlObj.searchParams.get('id');
    if (skuParam) return skuParam;

    // Last path segment — /product/SKU-12345
    if (pathParts.length > 0) {
      const last = pathParts[pathParts.length - 1];
      if (last.length >= 3 && !/^(api|v1|v2|products|items|scan|qr|g|s)$/i.test(last)) {
        return last;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseBinQR(data: string): BinInfo | null {
  try {
    const parsed = JSON.parse(data);

    // Must be a location-type QR — strict check to avoid treating item QRs as bins
    if (parsed.type === 'location' && parsed.location_id && parsed.location_code) {
      return {
        bin_location_id: parsed.location_id,
        bin_code: parsed.location_code,
        full_path: parsed.full_path || parsed.location_code,
        warehouse_id: parsed.warehouse_id || '',
        warehouse_name: parsed.warehouse_name || '',
      };
    }

    // Legacy / alternate JSON format with explicit bin fields
    // Only match if the JSON has bin-specific keys (not just a generic 'id' or 'code')
    const binId = parsed.bin_id || parsed.bin_location_id;
    const binCode = parsed.bin_code;
    if (binId && binCode) {
      return { bin_location_id: binId, bin_code: binCode, full_path: parsed.full_path || binCode, warehouse_id: parsed.warehouse_id || '', warehouse_name: parsed.warehouse_name || '' };
    }
    return null;
  } catch {
    // Non-JSON data: do NOT treat as a bin — let parseItemQR handle it instead.
    // Previously this fallthrough swallowed every plain-text scan (barcodes, SKUs, URLs),
    // making it impossible to scan items after the bin was set.
    return null;
  }
}

function parseItemQR(data: string): { item_id: string; sku: string; name?: string; batch_number: string; quantity: number } | null {
  // 1. JSON payload
  try {
    const parsed = JSON.parse(data);
    const itemId = parsed.item_id || parsed.id;
    const sku = parsed.sku || parsed.code || '';
    const batch = parsed.batch || parsed.batch_number || parsed.batch_no || '';
    const qty = parseFloat(parsed.qty || parsed.quantity || '1');
    if (sku) {
      return { item_id: itemId || '', sku, name: parsed.name || parsed.product_name, batch_number: batch, quantity: isNaN(qty) ? 1 : qty };
    }
  } catch { /* not JSON */ }

  const trimmed = data.trim();

  // 2. URL → extract SKU
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const sku = extractSkuFromUrl(trimmed);
    if (sku) return { item_id: '', sku, batch_number: '', quantity: 1 };
  }

  // 3. Plain string
  if (trimmed.length > 0) {
    return { item_id: '', sku: trimmed, batch_number: '', quantity: 1 };
  }
  return null;
}

// ============ Component ============

export default function AssignBinScreen() {
  const { selectedWarehouse } = useAuthStore();

  const [phase, setPhase] = useState<ScreenPhase>('idle');
  const [binInfo, setBinInfo] = useState<BinInfo | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<{ binCode: string; fullPath: string; itemCount: number } | null>(null);

  const binLocked = binInfo !== null;

  // ============ Scanner handler — auto-detect bin vs item ============

  const handleScan = useCallback(
    async (data: string) => {
      setError(null);

      // Try bin first
      const bin = parseBinQR(data);
      if (bin) {
        if (binLocked) {
          Alert.alert('Bin Already Set', `Bin ${binInfo!.bin_code} is locked. Tap "Review" to change it.`);
          return;
        }
        setBinInfo(bin);
        return;
      }

      // Try item
      const parsed = parseItemQR(data);
      if (!parsed || !parsed.sku) {
        Alert.alert('Unknown QR', 'Could not recognize this QR code.');
        return;
      }

      // Resolve item_id if missing
      if (!parsed.item_id && selectedWarehouse) {
        const lookedUp = await binService.lookupItemBySku(parsed.sku, selectedWarehouse.id);
        if (lookedUp) {
          parsed.item_id = lookedUp.item_id;
          parsed.name = parsed.name || lookedUp.name;
        } else {
          Alert.alert('Not Found', `No item found for SKU: ${parsed.sku}`);
          return;
        }
      }

      // Add to list with defaults (qty=1, no batch)
      const finalItem: ScannedItem = {
        ...parsed,
        quantity: parsed.quantity || 1,
      };

      setItems((prev) => [...prev, finalItem]);
    },
    [binLocked, binInfo, selectedWarehouse]
  );

  // ============ Actions ============

  const handleStartScan = () => {
    setBinInfo(null);
    setItems([]);
    setError(null);
    setPhase('scanning');
  };

  const handleGoToReview = () => {
    setPhase('review');
  };

  const handleChangeBin = () => {
    // Keep items, clear bin, go back to scanning
    setBinInfo(null);
    setPhase('scanning');
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleComplete = async () => {
    if (!binInfo || items.length === 0) return;

    setPhase('submitting');
    setError(null);

    const results = await Promise.allSettled(
      items.map((item) =>
        binService.addStockToBin({
          bin_id: binInfo.bin_location_id,
          item_id: item.item_id,
          quantity: item.quantity,
          batch_number: item.batch_number || undefined,
        })
      )
    );

    const failed = results
      .map((result, i) =>
        result.status === 'rejected'
          ? `${items[i].sku}: ${getBackendErrorMessage(result.reason) || 'Something went wrong. Please try again.'}`
          : null
      )
      .filter((msg): msg is string => msg !== null);

    if (failed.length > 0) {
      // Keep only the failed items so a retry doesn't re-add stock for items
      // that already succeeded (addStockToBin is additive).
      const failedIndexes = new Set(
        results
          .map((result, i) => (result.status === 'rejected' ? i : -1))
          .filter((i) => i >= 0)
      );
      setItems((prev) => prev.filter((_, i) => failedIndexes.has(i)));
      setError(`Some items failed:\n${failed.join('\n')}`);
      setPhase('review');
      return;
    }

    setSuccessSummary({
      binCode: binInfo.bin_code,
      fullPath: binInfo.full_path,
      itemCount: items.length,
    });
    setPhase('success');
  };

  const handleNewSession = () => {
    setBinInfo(null);
    setItems([]);
    setError(null);
    setSuccessSummary(null);
    setPhase('idle');
  };

  // ============ RENDER: Idle ============

  if (phase === 'idle') {
    return <IdleView onStartScan={handleStartScan} />;
  }

  // ============ RENDER: Scanning ============

  if (phase === 'scanning') {
    return (
      <ScanningView
        binLocked={binLocked}
        itemCount={items.length}
        onScan={handleScan}
        onCancel={handleNewSession}
        onReview={handleGoToReview}
      />
    );
  }

  // ============ RENDER: Review ============

  if (phase === 'review') {
    return (
      <ReviewView
        binInfo={binInfo}
        items={items}
        error={error}
        onChangeBin={handleChangeBin}
        onRemoveItem={handleRemoveItem}
        onBackToScan={() => setPhase('scanning')}
        onComplete={handleComplete}
      />
    );
  }

  // ============ RENDER: Submitting ============

  if (phase === 'submitting') {
    return <SubmittingView itemCount={items.length} binCode={binInfo?.bin_code} />;
  }

  // ============ RENDER: Success ============

  if (phase === 'success' && successSummary) {
    return (
      <SuccessView
        itemCount={successSummary.itemCount}
        binCode={successSummary.binCode}
        fullPath={successSummary.fullPath}
        onNewSession={handleNewSession}
      />
    );
  }

  return null;
}



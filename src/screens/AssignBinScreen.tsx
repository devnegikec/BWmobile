// ============================================================
// Assign Bin Screen — Single scanner, auto-detect bin vs item
// Flow: idle → scanning → review → submitting → success
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
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import QrScanner from '../components/QrScanner';
import * as binService from '../api/binService';

type ScreenPhase = 'idle' | 'scanning' | 'review' | 'submitting' | 'success';

interface BinInfo {
  bin_location_id: string;
  bin_code: string;
  full_path: string;
  warehouse_id: string;
  warehouse_name: string;
}

interface ScannedItem {
  item_id: string;
  sku: string;
  name?: string;
  batch_number: string;
  quantity: number;
}

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

  // ============ Safe error extractor ============

  const getErrorMessage = (err: any): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object' && detail !== null) {
      return detail.message || detail.error || JSON.stringify(detail);
    }
    if (typeof err?.message === 'string') return err.message;
    return 'Something went wrong. Please try again.';
  };

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
          ? `${items[i].sku}: ${getErrorMessage(result.reason)}`
          : null
      )
      .filter((msg): msg is string => msg !== null);

    if (failed.length > 0) {
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
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Assign Bin</Text>
          <Text style={styles.headerSubtitle}>Scan bin & items to map stock to a location</Text>
        </View>

        <View style={styles.idleContent}>
          <TouchableOpacity style={styles.scanButton} onPress={handleStartScan}>
            <Text style={styles.scanButtonText}>Scan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============ RENDER: Scanning ============

  if (phase === 'scanning') {
    return (
      <View style={styles.container}>
        {/* Status bar — minimal */}
        <View style={styles.statusBar}>
          <View style={styles.statusLeft}>
            <Text style={styles.statusLabel}>
              {binLocked ? '🔒 Bin locked' : '📱 Waiting for bin'}
            </Text>
          </View>
          <View style={styles.statusRight}>
            <Text style={styles.statusCount}>{items.length}</Text>
            <Text style={styles.statusCountLabel}>items</Text>
          </View>
        </View>

        {/* Scanner */}
        <QrScanner
          onScan={handleScan}
          title={binLocked ? 'Scan Items' : 'Scan Bin or Item'}
          subtitle={
            binLocked
              ? `${items.length} item(s) scanned`
              : 'Scan a bin QR first, or scan items'
          }
        />

        {/* Bottom actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleNewSession}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, items.length === 0 && styles.buttonDisabled]}
            onPress={handleGoToReview}
            disabled={items.length === 0}
          >
            <Text style={styles.primaryButtonText}>
              Review ({items.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============ RENDER: Review ============

  if (phase === 'review') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.reviewContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Review Assignment</Text>
        </View>

        {/* Bin card */}
        {binInfo && (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewSectionTitle}>Bin</Text>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Code</Text>
              <Text style={styles.reviewValue}>{binInfo.bin_code}</Text>
            </View>
            {binInfo.full_path !== binInfo.bin_code && (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Path</Text>
                <Text style={styles.reviewValue}>{binInfo.full_path}</Text>
              </View>
            )}
            {binInfo.warehouse_name ? (
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Warehouse</Text>
                <Text style={styles.reviewValue}>{binInfo.warehouse_name}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.linkButton} onPress={handleChangeBin}>
              <Text style={styles.linkButtonText}>🔄 Change Bin</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Items list */}
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSectionTitle}>
            Items ({items.length})
          </Text>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No items scanned yet.</Text>
          ) : (
            items.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemSku}>{item.sku}</Text>
                  {item.name && <Text style={styles.itemName}>{item.name}</Text>}
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemMetaText}>Qty: {item.quantity}</Text>
                    {item.batch_number ? (
                      <Text style={styles.itemMetaText}>Batch: {item.batch_number}</Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveItem(i)}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Actions */}
        <View style={styles.reviewActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setPhase('scanning')}>
            <Text style={styles.secondaryButtonText}>← Back to Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, (!binInfo || items.length === 0) && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={!binInfo || items.length === 0}
          >
            <Text style={styles.primaryButtonText}>
              Complete ({items.length} items)
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ============ RENDER: Submitting ============

  if (phase === 'submitting') {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={styles.centeredTitle}>Assigning items to bin...</Text>
          <Text style={styles.centeredSubtitle}>
            {items.length} item(s) → {binInfo?.bin_code}
          </Text>
        </View>
      </View>
    );
  }

  // ============ RENDER: Success ============

  if (phase === 'success' && successSummary) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.centeredTitle}>Assignment Complete!</Text>
          <View style={styles.successCard}>
            <Text style={styles.successDetail}>
              {successSummary.itemCount} item(s)
            </Text>
            <Text style={styles.successDetail}>
              → Bin: {successSummary.binCode}
            </Text>
            {successSummary.fullPath !== successSummary.binCode && (
              <Text style={styles.successPath}>{successSummary.fullPath}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={handleNewSession}>
            <Text style={styles.primaryButtonText}>New Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

// ============ STYLES ============

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#1A2332',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#8899AA',
    fontSize: 14,
    marginTop: 4,
  },

  // ---- Idle ----
  idleContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButton: {
    width: 320,
    height:60,
    borderRadius: 10,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonIcon: {
    fontSize: 56,
    marginBottom: 4,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },

  // ---- Scanning ----
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    paddingHorizontal: 24,
    paddingTop: 55,
    paddingBottom: 12,
  },
  statusLeft: {
    flex: 1,
  },
  statusLabel: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '600',
  },
  statusRight: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  statusCount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statusCountLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    textTransform: 'uppercase',
  },

  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 12,
  },

  // ---- Review ----
  reviewContent: {
    paddingBottom: 40,
  },
  reviewCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    margin: 24,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  reviewSectionTitle: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  reviewLabel: {
    color: '#8899AA',
    fontSize: 14,
  },
  reviewValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  itemInfo: {
    flex: 1,
  },
  itemSku: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  itemName: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  itemMetaText: {
    color: '#667788',
    fontSize: 11,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#667788',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },

  reviewActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
  },

  // ---- Submitting / Success / Centered ----
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  centeredTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  centeredSubtitle: {
    color: '#8899AA',
    fontSize: 14,
  },
  successIcon: {
    fontSize: 56,
  },
  successCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1A73E8',
    width: '100%',
    gap: 4,
    alignItems: 'center',
  },
  successDetail: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successPath: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },

  // ---- Shared ----
  primaryButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    flex: 1,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#B0C4D8',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: 12,
  },
});

// ============================================================
// Direct Put-Away — Scan QSeal (parent) or item QR,
// then assign to bins. Modeled after InboundScreen scanning UI.
// ============================================================
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as binService from '../api/binService';
import * as qsealService from '../api/qsealService';
import QrScanner from '../components/QrScanner';
import type { QSealParentWithUnits } from '../types';

// ── Types ──
interface ScannedItem {
  key: string;
  sku: string;
  productName?: string;
  batchNumber?: string;
  serialNumber?: string;
  quantity: number;
  assignedBin?: string;
  status: 'pending' | 'assigned';
}

interface BinSuggestion {
  bin_location_id: string;
  bin_code: string;
  bin_name: string;
  quantity_on_hand: number;
  batch_number: string;
  available_capacity: number;
}

type ViewState = 'scanning' | 'bins';

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse, user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  // ── Scanning state ──
  const [viewState, setViewState] = useState<ViewState>('scanning');
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [lastScanFeedback, setLastScanFeedback] = useState<string | null>(null);
  const [isProcessingQSeal, setIsProcessingQSeal] = useState(false);

  // ── Bin assignment state ──
  const [activeItem, setActiveItem] = useState<ScannedItem | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [bins, setBins] = useState<BinSuggestion[]>([]);
  const [loadingBins, setLoadingBins] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignAllBinId, setAssignAllBinId] = useState<string>('');

  // ── Total counts ──
  const boxCount = scannedItems.filter((i) => i.key.startsWith('box-')).length;
  const itemCount = scannedItems.filter((i) => !i.key.startsWith('box-')).length;

  // ================================================================
  // Detect if QR data is a QSeal URL
  // ================================================================
  const extractQSealSerial = (qrData: string): string | null => {
    const trimmed = qrData.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
    try {
      const url = new URL(trimmed);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const qsealIdx = pathParts.indexOf('qseal');
      if (qsealIdx !== -1 && qsealIdx + 1 < pathParts.length) {
        return pathParts[qsealIdx + 1];
      }
      const sIdx = pathParts.indexOf('s');
      if (sIdx !== -1 && sIdx + 1 < pathParts.length) {
        return pathParts[sIdx + 1];
      }
    } catch {}
    return null;
  };

  // ================================================================
  // Handle QSeal (parent/box) scan
  // ================================================================
  const handleQSealScan = async (serial: string) => {
    if (!orgId) {
      Alert.alert('Error', 'Organization not found. Please log in again.');
      return;
    }
    setIsProcessingQSeal(true);
    try {
      const node = await qsealService.scanQSeal(orgId, { serial_number: serial, device_type: 'mobile', os: 'iOS/Android', ip_address: '' });
      const parent: QSealParentWithUnits = await qsealService.getLinkedUnits(node.node_id);
      const units = parent.linked_units || [];

      // Add as a box + its items
      setScannedItems((prev) => {
        const newItems: ScannedItem[] = [
          {
            key: `box-${node.node_id}`,
            sku: '',
            productName: parent.name || `Box ${serial}`,
            serialNumber: serial,
            quantity: units.length,
            status: 'pending',
          },
        ];
        for (const unit of units) {
          newItems.push({
            key: `item-${unit.id}`,
            sku: unit.product_sku || '',
            productName: unit.product_name,
            batchNumber: unit.dispatch_batch,
            serialNumber: unit.serial_number,
            quantity: 1,
            status: 'pending',
          });
        }
        return [...prev, ...newItems];
      });

      setLastScanFeedback(`📦 Box "${parent.name || serial}" — ${units.length} item(s)`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to process QSeal.';
      Alert.alert('QSeal Error', typeof detail === 'string' ? detail : detail?.message || 'Failed');
    } finally {
      setIsProcessingQSeal(false);
    }
  };

  // ================================================================
  // Handle regular item QR scan
  // ================================================================
  const handleItemScan = async (data: string) => {
    const scanned = data.trim();
    if (!scanned || !selectedWarehouse) return;

    try {
      const item = await binService.lookupItemBySku(scanned, selectedWarehouse.id);
      if (!item) {
        Alert.alert('Not Found', `Item not found for "${scanned}".`);
        return;
      }

      setScannedItems((prev) => {
        // Avoid duplicate
        const exists = prev.find((i) => i.sku === item.sku);
        if (exists) {
          setLastScanFeedback(`⚠️ ${item.name || item.sku} already scanned`);
          return prev;
        }
        return [
          ...prev,
          {
            key: `item-${Date.now()}`,
            sku: item.sku,
            productName: item.name,
            quantity: 1,
            status: 'pending',
          },
        ];
      });
      setLastScanFeedback(`✅ ${item.name || item.sku}`);
    } catch {
      Alert.alert('Error', 'Failed to look up item.');
    }
  };

  // ================================================================
  // Main scan handler — routes to QSeal or item
  // ================================================================
  const handleScan = useCallback(
    async (data: string) => {
      const qsealSerial = extractQSealSerial(data);
      if (qsealSerial) {
        await handleQSealScan(qsealSerial);
      } else {
        await handleItemScan(data);
      }
    },
    [orgId, selectedWarehouse]
  );

  // ================================================================
  // Fetch bins for an item
  // ================================================================
  const fetchBins = async (item: ScannedItem) => {
    if (!selectedWarehouse) return;
    setActiveItem(item);
    setLoadingBins(true);
    setBins([]);
    try {
      // Try lookup by SKU first
      const lookedUp = await binService.lookupItemBySku(item.sku, selectedWarehouse.id);
      if (lookedUp) {
        const stock = await binService.getBinStockForItem(lookedUp.item_id);
        setBins(
          (stock.bins || []).map((b) => ({
            bin_location_id: b.bin_location_id,
            bin_code: b.bin_code,
            bin_name: b.bin_name || b.bin_code,
            quantity_on_hand: b.quantity_on_hand,
            batch_number: b.batch_number,
            available_capacity: b.available_capacity,
          }))
        );
      } else {
        setBins([]);
      }
    } catch {
      setBins([]);
    } finally {
      setLoadingBins(false);
    }
  };

  // ================================================================
  // Assign single item to bin
  // ================================================================
  const assignSingleToBin = async (item: ScannedItem, binId: string, binLabel: string) => {
    if (!selectedWarehouse) return;
    setAssigningId(item.key);
    try {
      const lookedUp = await binService.lookupItemBySku(item.sku, selectedWarehouse.id);
      if (!lookedUp) { Alert.alert('Error', 'Item not found'); return; }
      await binService.addStockToBin({
        bin_id: binId,
        item_id: lookedUp.item_id,
        quantity: item.quantity,
        batch_number: item.batchNumber || undefined,
      });
      setScannedItems((prev) =>
        prev.map((i) => (i.key === item.key ? { ...i, status: 'assigned' as const, assignedBin: binLabel } : i))
      );
      Alert.alert('Done', `${item.productName || item.sku} → ${binLabel}`);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed.');
    } finally {
      setAssigningId(null);
    }
  };

  // ================================================================
  // Assign ALL pending items to same bin
  // ================================================================
  const assignAllToBin = async () => {
    const binId = assignAllBinId.trim();
    if (!binId) { Alert.alert('Error', 'Enter or scan a bin ID.'); return; }
    const pending = scannedItems.filter((i) => i.status === 'pending' && i.sku);
    if (pending.length === 0) { Alert.alert('Info', 'No pending items.'); return; }

    let success = 0;
    for (const item of pending) {
      try {
        const lookedUp = await binService.lookupItemBySku(item.sku, selectedWarehouse!.id);
        if (!lookedUp) continue;
        await binService.addStockToBin({
          bin_id: binId,
          item_id: lookedUp.item_id,
          quantity: item.quantity,
          batch_number: item.batchNumber || undefined,
        });
        setScannedItems((prev) =>
          prev.map((i) => (i.key === item.key ? { ...i, status: 'assigned' as const, assignedBin: binId } : i))
        );
        success++;
      } catch {}
    }
    Alert.alert('Done', `${success}/${pending.length} items → ${binId}`);
    setAssignAllBinId('');
  };

  // ================================================================
  // RENDER: Scanning
  // ================================================================
  if (viewState === 'scanning') {
    return (
      <View style={styles.container}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>Direct Put-Away</Text>
          </View>
          {/* Scan count badge */}
          {scannedItems.length > 0 && (
            <View style={styles.scanCount}>
              <Text style={styles.scanCountNum}>{scannedItems.length}</Text>
              <Text style={styles.scanCountLabel}>scanned</Text>
            </View>
          )}
        </View>

        {/* ── QR Scanner ── */}
        <QrScanner
          onScan={handleScan}
          title="Scan QSeal Box or Item QR"
          subtitle="Scan parent QSeal to capture all items, or scan individual items"
        />

        {/* ── Processing QSeal ── */}
        {isProcessingQSeal && (
          <View style={styles.processingBar}>
            <ActivityIndicator size="small" color="#1A73E8" />
            <Text style={styles.processingText}>Fetching linked units...</Text>
          </View>
        )}

        {/* ── QSeal/Items count bar ── */}
        {scannedItems.length > 0 && (
          <View style={styles.countBar}>
            <Text style={styles.countText}>
              {boxCount > 0 && `📦 ${boxCount} box${boxCount > 1 ? 'es' : ''} · `}
              📋 {itemCount} item{itemCount !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* ── Last scan feedback ── */}
        {lastScanFeedback && (
          <View style={styles.lastScanToast}>
            <Text style={styles.lastScanText}>{lastScanFeedback}</Text>
          </View>
        )}

        {/* ── Action buttons ── */}
        {scannedItems.length > 0 && (
          <View style={styles.scanActions}>
            <TouchableOpacity
              style={styles.viewBinsButton}
              onPress={() => setViewState('bins')}
            >
              <Text style={styles.viewBinsButtonText}>
                View & Assign Bins ({scannedItems.filter((i) => i.status === 'pending').length} pending)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                Alert.alert('Clear All', 'Remove all scanned items?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => { setScannedItems([]); setLastScanFeedback(null); } },
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
  // RENDER: Bin Assignment
  // ================================================================
  const pendingItems = scannedItems.filter((i) => i.status === 'pending');
  const assignedItems = scannedItems.filter((i) => i.status === 'assigned');

  return (
    <View style={styles.container}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setViewState('scanning')} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Assign to Bins</Text>
          <Text style={styles.topBarSub}>
            {pendingItems.length} pending · {assignedItems.length} done
          </Text>
        </View>
      </View>

      <ScrollView style={styles.binsScroll} contentContainerStyle={styles.binsScrollContent}>
        {/* ── Assign ALL to same bin ── */}
        {pendingItems.length > 0 && (
          <View style={styles.assignAllSection}>
            <Text style={styles.sectionTitle}>🚀 Assign ALL pending to one bin</Text>
            <View style={styles.assignAllRow}>
              <TextInput
                style={styles.binIdInput}
                placeholder="Enter or scan bin ID"
                placeholderTextColor="#667788"
                value={assignAllBinId}
                onChangeText={setAssignAllBinId}
              />
              <TouchableOpacity style={styles.assignAllButton} onPress={assignAllToBin}>
                <Text style={styles.assignAllButtonText}>Assign All</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Scanned items list ── */}
        {scannedItems.map((item) => (
          <View
            key={item.key}
            style={[
              styles.scannedItemCard,
              item.status === 'assigned' && styles.scannedItemAssigned,
            ]}
          >
            <View style={styles.scannedItemInfo}>
              {item.key.startsWith('box-') ? (
                <>
                  <Text style={styles.scannedItemBox}>📦 {item.productName}</Text>
                  <Text style={styles.scannedItemBoxMeta}>Serial: {item.serialNumber} · {item.quantity} items</Text>
                </>
              ) : (
                <>
                  <Text style={styles.scannedItemName}>{item.productName || item.sku}</Text>
                  <Text style={styles.scannedItemMeta}>
                    SKU: {item.sku}
                    {item.batchNumber ? ` · Batch: ${item.batchNumber}` : ''}
                  </Text>
                </>
              )}
            </View>

            {item.status === 'assigned' ? (
              <View style={styles.assignedBadge}>
                <Text style={styles.assignedBadgeText}>✅ {item.assignedBin}</Text>
              </View>
            ) : item.sku ? (
              <TouchableOpacity
                style={styles.assignOneButton}
                onPress={() => fetchBins(item)}
              >
                <Text style={styles.assignOneButtonText}>→</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        {/* ── Bin suggestions (when active item selected) ── */}
        {activeItem && (
          <View style={styles.binsSection}>
            <View style={styles.binsSectionHeader}>
              <Text style={styles.sectionTitle}>
                Bins for {activeItem.productName || activeItem.sku}
              </Text>
              <TouchableOpacity onPress={() => { setActiveItem(null); setBins([]); }}>
                <Text style={styles.binsSectionClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingBins ? (
              <ActivityIndicator color="#1A73E8" style={{ padding: 20 }} />
            ) : bins.length === 0 ? (
              <TouchableOpacity
                style={styles.noBinsPrompt}
                onPress={() => {
                  Alert.prompt
                    ? Alert.prompt('Enter Bin ID', 'Type or scan bin ID:', (binId) => {
                        if (binId?.trim()) assignSingleToBin(activeItem, binId.trim(), binId.trim());
                      })
                    : Alert.alert('No Bins', 'No bins hold this item. Enter a bin ID manually.', [{ text: 'OK' }]);
                }}
              >
                <Text style={styles.noBinsPromptText}>📷 No bins found — tap to enter bin ID</Text>
              </TouchableOpacity>
            ) : (
              bins.map((bin, idx) => (
                <TouchableOpacity
                  key={bin.bin_location_id}
                  style={styles.binCard}
                  onPress={() =>
                    Alert.alert('Confirm', `Put into ${bin.bin_code}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm', onPress: () => assignSingleToBin(activeItem, bin.bin_location_id, bin.bin_code) },
                    ])
                  }
                  disabled={assigningId === activeItem.key}
                >
                  <View style={styles.binRank}>
                    <Text style={styles.binRankText}>{idx === 0 ? '★' : `#${idx + 1}`}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.binCode}>{bin.bin_code}</Text>
                    <Text style={styles.binMeta}>📦 {bin.quantity_on_hand} on hand · 📐 {bin.available_capacity} free</Text>
                  </View>
                  {assigningId === activeItem.key ? (
                    <ActivityIndicator color="#1A73E8" size="small" />
                  ) : (
                    <Text style={styles.binArrow}>→</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* ── Back to scan ── */}
        <TouchableOpacity style={styles.backToScanFooter} onPress={() => { setViewState('scanning'); setActiveItem(null); }}>
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

  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 55,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1A2332',
    gap: 12,
    zIndex: 10,
  },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A3A4A', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#8899AA', fontSize: 16, fontWeight: '700' },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  topBarSub: { color: '#8899AA', fontSize: 12, marginTop: 2 },

  // ── Scan count ──
  scanCount: {
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'center',
  },
  scanCountNum: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scanCountLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },

  // ── Processing ──
  processingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: 'rgba(26,115,232,0.1)',
    gap: 8,
  },
  processingText: { color: '#1A73E8', fontSize: 13 },

  // ── Count bar ──
  countBar: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  countText: { color: '#10B981', fontSize: 14, fontWeight: '600' },

  // ── Last scan toast ──
  lastScanToast: {
    backgroundColor: 'rgba(26,35,50,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  lastScanText: { color: '#B0C4D8', fontSize: 13 },

  // ── Scan actions ──
  scanActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
  },
  viewBinsButton: {
    flex: 2,
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  viewBinsButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  clearButton: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearButtonText: { color: '#9CA3AF', fontSize: 15, fontWeight: '500' },

  // ── Bins view ──
  binsScroll: { flex: 1 },
  binsScrollContent: { padding: 16, paddingBottom: 60 },

  // ── Assign all ──
  assignAllSection: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  sectionTitle: { color: '#B0C4D8', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  assignAllRow: { flexDirection: 'row', gap: 10 },
  binIdInput: {
    flex: 1,
    backgroundColor: '#0F1923',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assignAllButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignAllButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // ── Scanned items ──
  scannedItemCard: {
    backgroundColor: '#1A2332',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scannedItemAssigned: { borderColor: '#10B981', opacity: 0.7 },
  scannedItemInfo: { flex: 1 },
  scannedItemName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scannedItemMeta: { color: '#667788', fontSize: 12, marginTop: 2 },
  scannedItemBox: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },
  scannedItemBoxMeta: { color: '#667788', fontSize: 11, marginTop: 2 },
  assignedBadge: { paddingHorizontal: 10 },
  assignedBadgeText: { color: '#10B981', fontSize: 12, fontWeight: '600' },
  assignOneButton: {
    backgroundColor: '#1A73E8',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignOneButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Bin suggestions ──
  binsSection: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1A73E8',
  },
  binsSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  binsSectionClose: { color: '#8899AA', fontSize: 16, fontWeight: '700' },
  binCard: {
    backgroundColor: '#0F1923',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  binRank: { backgroundColor: '#1A73E8', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  binRankText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  binCode: { color: '#fff', fontSize: 14, fontWeight: '600' },
  binMeta: { color: '#667788', fontSize: 11, marginTop: 2 },
  binArrow: { color: '#1A73E8', fontSize: 18, fontWeight: '700' },
  noBinsPrompt: {
    backgroundColor: '#0F1923',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderStyle: 'dashed',
  },
  noBinsPromptText: { color: '#60A5FA', fontSize: 14, fontWeight: '500' },

  // ── Footer ──
  backToScanFooter: {
    backgroundColor: '#1A3A5C',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  backToScanText: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },
});

// ============================================================
// Direct Put-Away Screen — Standalone (no slip required)
// Scan item → lookup → show bins → scan/select bin → put away
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
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as binService from '../api/binService';
import QrScanner from '../components/QrScanner';

type ViewState = 'scanning' | 'bins';

interface FoundItem {
  item_id: string;
  sku: string;
  name: string;
  quantity?: number;
  batch_number?: string;
}

interface BinSuggestion {
  bin_location_id: string;
  bin_code: string;
  bin_name: string;
  quantity_on_hand: number;
  batch_number: string;
  available_capacity: number;
}

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse } = useAuthStore();

  const [viewState, setViewState] = useState<ViewState>('scanning');
  const [foundItem, setFoundItem] = useState<FoundItem | null>(null);
  const [bins, setBins] = useState<BinSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [putAwayCount, setPutAwayCount] = useState(0);

  // Quantity input
  const [quantity, setQuantity] = useState('');

  // ================================================================
  // Handle item QR scan
  // ================================================================
  const handleScan = useCallback(
    async (data: string) => {
      const scanned = data.trim();
      if (!scanned || !selectedWarehouse) return;

      setLoading(true);
      setFoundItem(null);
      setBins([]);
      setQuantity('');

      try {
        // Lookup item by scanned SKU/code
        const item = await binService.lookupItemBySku(scanned, selectedWarehouse.id);

        if (!item) {
          Alert.alert(
            'Item Not Found',
            `No item found for "${scanned}". Check the QR and try again.`,
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
        }

        setFoundItem({ ...item, quantity: 1 });

        // Fetch bins that already hold this item (FIFO consolidation)
        const stock = await binService.getBinStockForItem(item.item_id);
        const suggestionBins: BinSuggestion[] = (stock.bins || []).map((b) => ({
          bin_location_id: b.bin_location_id,
          bin_code: b.bin_code,
          bin_name: b.bin_name || b.bin_code,
          quantity_on_hand: b.quantity_on_hand,
          batch_number: b.batch_number,
          available_capacity: b.available_capacity,
        }));

        setBins(suggestionBins);
        setViewState('bins');
      } catch (err: any) {
        Alert.alert('Error', 'Failed to look up item. Try again.');
      } finally {
        setLoading(false);
      }
    },
    [selectedWarehouse]
  );

  // ================================================================
  // Handle bin QR scan (from bin suggestion screen)
  // ================================================================
  const handleBinScan = useCallback(
    async (data: string) => {
      const binId = data.trim();
      if (!binId || !foundItem) return;

      await doAssignBin(binId, binId);
    },
    [foundItem]
  );

  // ================================================================
  // Assign item to bin
  // ================================================================
  const doAssignBin = async (binId: string, binLabel: string) => {
    if (!foundItem) return;
    const qty = parseInt(quantity, 10) || 1;

    setAssigningId(binId);
    try {
      await binService.addStockToBin({
        bin_id: binId,
        item_id: foundItem.item_id,
        quantity: qty,
        batch_number: foundItem.batch_number || undefined,
      });
      setPutAwayCount((c) => c + 1);
      Alert.alert('Done', `${foundItem.name || foundItem.sku} (×${qty}) → ${binLabel}`);
      // Back to scanning
      setFoundItem(null);
      setBins([]);
      setViewState('scanning');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to add stock to bin.');
    } finally {
      setAssigningId(null);
    }
  };

  // ================================================================
  // Back to scan
  // ================================================================
  const handleBackToScan = () => {
    setFoundItem(null);
    setBins([]);
    setQuantity('');
    setViewState('scanning');
  };

  // ================================================================
  // RENDER
  // ================================================================
  return (
    <View style={styles.container}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Direct Put-Away</Text>
        {putAwayCount > 0 && (
          <View style={styles.counterBadge}>
            <Text style={styles.counterBadgeText}>{putAwayCount} done</Text>
          </View>
        )}
      </View>

      {/* ── Loading overlay ── */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#1A73E8" size="large" />
          <Text style={styles.loadingText}>Looking up item...</Text>
        </View>
      )}

      {/* ── Camera / Scanner ── */}
      {viewState === 'scanning' && !loading && (
        <View style={styles.scannerContainer}>
          <QrScanner
            onScan={handleScan}
            title="Scan Item"
            subtitle="Scan the item QR code to look it up"
          />
        </View>
      )}

      {/* ── Bin Suggestions (after item found) ── */}
      {viewState === 'bins' && foundItem && (
        <View style={styles.binsContainer}>
          {/* Item found banner */}
          <View style={styles.foundBanner}>
            <View style={styles.foundBannerLeft}>
              <Text style={styles.foundIcon}>📦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.foundName}>{foundItem.name || foundItem.sku}</Text>
                <Text style={styles.foundSku}>SKU: {foundItem.sku}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleBackToScan}>
              <Text style={styles.foundBack}>← Rescan</Text>
            </TouchableOpacity>
          </View>

          {/* Quantity input */}
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Quantity:</Text>
            <TextInput
              style={styles.qtyInput}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor="#667788"
            />
          </View>

          {/* Bin list */}
          <FlatList
            data={bins}
            keyExtractor={(b) => b.bin_location_id}
            contentContainerStyle={styles.binsList}
            ListHeaderComponent={
              <View style={styles.binsHeader}>
                <Text style={styles.binsHeaderTitle}>
                  {bins.length > 0
                    ? `🏆 ${bins.length} bin(s) with this item`
                    : 'No bins currently hold this item'}
                </Text>
                <Text style={styles.binsHeaderSub}>
                  {bins.length > 0
                    ? 'Tap a bin to put away, or scan a different bin'
                    : 'Scan a bin QR to put away'}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <TouchableOpacity
                style={styles.scanBinPrompt}
                onPress={() => {
                  // In production: open bin QR scanner
                  Alert.prompt
                    ? Alert.prompt(
                        'Enter Bin ID',
                        'Type or scan the bin location ID:',
                        (binId) => {
                          if (binId && binId.trim()) {
                            doAssignBin(binId.trim(), binId.trim());
                          }
                        }
                      )
                    : Alert.alert(
                        'Scan Bin',
                        'In production, scan a bin QR to put away this item.',
                        [{ text: 'OK' }]
                      );
                }}
              >
                <Text style={styles.scanBinPromptIcon}>📷</Text>
                <Text style={styles.scanBinPromptText}>Scan a bin QR to put away</Text>
              </TouchableOpacity>
            }
            renderItem={({ item: bin, index }) => (
              <TouchableOpacity
                style={styles.binCard}
                onPress={() =>
                  Alert.alert(
                    'Confirm Put-Away',
                    `Put ${foundItem.name || foundItem.sku} into ${bin.bin_code}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Confirm',
                        onPress: () => doAssignBin(bin.bin_location_id, bin.bin_code),
                      },
                    ]
                  )
                }
                disabled={assigningId === bin.bin_location_id}
              >
                <View style={styles.binRank}>
                  <Text style={styles.binRankText}>
                    {index === 0 ? '★' : `#${index + 1}`}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.binCode}>{bin.bin_code}</Text>
                  <View style={styles.binMeta}>
                    <Text style={styles.binMetaText}>📦 {bin.quantity_on_hand} on hand</Text>
                    <Text style={styles.binMetaText}>📐 {bin.available_capacity} free</Text>
                  </View>
                </View>
                {assigningId === bin.bin_location_id ? (
                  <ActivityIndicator color="#1A73E8" size="small" />
                ) : (
                  <Text style={styles.binArrow}>→</Text>
                )}
              </TouchableOpacity>
            )}
            ListFooterComponent={
              bins.length > 0 ? (
                <TouchableOpacity
                  style={styles.scanBinFooter}
                  onPress={() => {
                    Alert.prompt
                      ? Alert.prompt(
                          'Enter Bin ID',
                          'Type or scan the bin location ID:',
                          (binId) => {
                            if (binId && binId.trim()) {
                              doAssignBin(binId.trim(), binId.trim());
                            }
                          }
                        )
                      : Alert.alert(
                          'Scan Bin',
                          'In production, scan a bin QR to override.',
                          [{ text: 'OK' }]
                        );
                  }}
                >
                  <Text style={styles.scanBinFooterText}>📷 Scan a different bin QR</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        </View>
      )}
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A3A4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: '#8899AA', fontSize: 16, fontWeight: '700' },
  topBarTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  counterBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  counterBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // ── Loading ──
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 100,
    backgroundColor: 'rgba(15,25,35,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  loadingText: { color: '#8899AA', fontSize: 15, marginTop: 12 },

  // ── Scanner ──
  scannerContainer: { flex: 1 },

  // ── Found item banner ──
  foundBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(26,115,232,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A73E8',
  },
  foundBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  foundIcon: { fontSize: 28 },
  foundName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  foundSku: { color: '#8899AA', fontSize: 12, marginTop: 2 },
  foundBack: { color: '#60A5FA', fontSize: 14, fontWeight: '600' },

  // ── Quantity ──
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A2332',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
    gap: 12,
  },
  qtyLabel: { color: '#B0C4D8', fontSize: 14, fontWeight: '600' },
  qtyInput: {
    backgroundColor: '#0F1923',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 8,
    width: 80,
    textAlign: 'center',
  },

  // ── Bin suggestions ──
  binsContainer: { flex: 1 },
  binsList: { padding: 16 },
  binsHeader: { marginBottom: 16 },
  binsHeaderTitle: { color: '#B0C4D8', fontSize: 15, fontWeight: '600' },
  binsHeaderSub: { color: '#667788', fontSize: 12, marginTop: 4 },

  binCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  binRank: {
    backgroundColor: '#1A73E8',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  binRankText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  binCode: { color: '#fff', fontSize: 15, fontWeight: '600' },
  binMeta: { flexDirection: 'row', gap: 16, marginTop: 4 },
  binMetaText: { color: '#667788', fontSize: 12 },
  binArrow: { color: '#1A73E8', fontSize: 20, fontWeight: '700' },

  scanBinPrompt: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1A73E8',
    borderStyle: 'dashed',
  },
  scanBinPromptIcon: { fontSize: 36, marginBottom: 12 },
  scanBinPromptText: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },

  scanBinFooter: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  scanBinFooterText: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },
});

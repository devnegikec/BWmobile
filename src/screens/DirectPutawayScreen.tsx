// ============================================================
// Direct Put-Away Screen — Scan items & put away one at a time
// (Workflow B: Two-Step Manual from PUT_AWAY_MOBILE_INTEGRATION.md)
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
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as inboundService from '../api/inboundService';
import QrScanner from '../components/QrScanner';
import type {
  ReceivingSlip,
  ReceivingSlipItem,
  FifoBinResponse,
  FifoBinSuggestion,
} from '../types';

type Step = 'selectSlip' | 'itemList' | 'suggestBins';

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse } = useAuthStore();

  // ── Step: Select Slip ──
  const [slips, setSlips] = useState<ReceivingSlip[]>([]);
  const [loadingSlips, setLoadingSlips] = useState(false);

  // ── Step: Item List ──
  const [selectedSlip, setSelectedSlip] = useState<ReceivingSlip | null>(null);
  const [slipItems, setSlipItems] = useState<ReceivingSlipItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Step: Bin Suggestions ──
  const [step, setStep] = useState<Step>('selectSlip');
  const [activeItem, setActiveItem] = useState<ReceivingSlipItem | null>(null);
  const [fifoBins, setFifoBins] = useState<FifoBinSuggestion[]>([]);
  const [loadingFifo, setLoadingFifo] = useState(false);
  const [assigningItem, setAssigningItem] = useState<string | null>(null);

  // ── QR Scanner ──
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanMode, setScanMode] = useState<'item' | 'bin'>('item');

  // ================================================================
  // Load pending_putaway slips
  // ================================================================
  const loadSlips = useCallback(async () => {
    if (!selectedWarehouse) return;
    setLoadingSlips(true);
    try {
      const response = await inboundService.getReceivingSlips({
        warehouse_id: selectedWarehouse.id,
        status: 'pending_putaway',
        page_size: 50,
      });
      setSlips(response.receiving_slips || []);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load slips.');
    } finally {
      setLoadingSlips(false);
    }
  }, [selectedWarehouse]);

  useEffect(() => {
    loadSlips();
  }, [loadSlips]);

  // ================================================================
  // Select a slip → load its items
  // ================================================================
  const handleSelectSlip = async (slip: ReceivingSlip) => {
    setLoadingDetail(true);
    try {
      const detail = await inboundService.getReceivingSlip(slip.id);
      setSelectedSlip(detail);
      // Only show items that haven't been put away yet (flag != rejected)
      const pendingItems = (detail.items || []).filter(
        (i) => i.flag !== 'rejected' && (i as any).put_away_status !== 'completed'
      );
      setSlipItems(pendingItems);
      setStep('itemList');
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load slip detail.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // ================================================================
  // Tap an item → fetch FIFO bin suggestions
  // ================================================================
  const handleSelectItem = async (item: ReceivingSlipItem) => {
    if (!selectedSlip) return;
    setActiveItem(item);
    setLoadingFifo(true);
    setFifoBins([]);
    setStep('suggestBins');
    try {
      const response = await inboundService.getFifoBins(selectedSlip.id, item.id);
      setFifoBins(response.bins || []);
    } catch (err: any) {
      // FIFO may fail if no bins exist yet — that's OK
      setFifoBins([]);
    } finally {
      setLoadingFifo(false);
    }
  };

  // ================================================================
  // Assign bin to item (confirm put-away)
  // ================================================================
  const handleAssignBin = async (binId: string, binPath: string) => {
    if (!selectedSlip || !activeItem) return;
    setAssigningItem(activeItem.id);
    try {
      await inboundService.assignBinToSlipItem(selectedSlip.id, activeItem.id, {
        bin_location_id: binId,
        quantity: activeItem.quantity,
      });
      // Remove item from pending list
      setSlipItems((prev) => prev.filter((i) => i.id !== activeItem.id));
      Alert.alert(
        'Done',
        `${activeItem.sku} put away into ${binPath || binId}.`
      );
      // Go back to item list if more items remain, else back to slip selection
      setSlipItems((prev) => {
        if (prev.length <= 1) {
          // All done — go back to slip selection
          setStep('selectSlip');
          loadSlips();
        } else {
          setStep('itemList');
        }
        return prev;
      });
      setActiveItem(null);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to assign bin.');
    } finally {
      setAssigningItem(null);
    }
  };

  // ================================================================
  // QR Scanner: scan item or bin
  // ================================================================
  const handleQRScan = (data: string) => {
    setScannerVisible(false);
    if (scanMode === 'bin') {
      // Bin QR scanned — use directly
      handleAssignBin(data, data);
    }
    // item scan mode — could verify item QR in the future
  };

  const handleScanBin = (item: ReceivingSlipItem) => {
    setActiveItem(item);
    setScanMode('bin');
    setScannerVisible(true);
  };

  // ================================================================
  // Back navigation
  // ================================================================
  const handleBack = () => {
    if (step === 'suggestBins') {
      setStep('itemList');
      setActiveItem(null);
    } else if (step === 'itemList') {
      setStep('selectSlip');
      setSelectedSlip(null);
      loadSlips();
    } else {
      navigation.goBack();
    }
  };

  // ================================================================
  // RENDER: Select Slip
  // ================================================================
  if (step === 'selectSlip') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Direct Put-Away</Text>
          <Text style={styles.headerSubtitle}>
            Select a slip with items ready for put-away
          </Text>
        </View>

        <FlatList
          data={slips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={loadingSlips}
              onRefresh={loadSlips}
              tintColor="#1A73E8"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No pending put-away slips</Text>
              <Text style={styles.emptySubtext}>
                Approve a receiving slip first, then it will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.slipCard}
              onPress={() => handleSelectSlip(item)}
            >
              <View style={styles.slipCardHeader}>
                <Text style={styles.slipNumber}>{item.slip_number}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>Pending Put-Away</Text>
                </View>
              </View>
              {item.asn_order_no && (
                <Text style={styles.slipAsn}>📋 {item.asn_order_no}</Text>
              )}
              <Text style={styles.slipDetail}>
                {item.items?.length || 0} item(s) · {item.total_items || '?'} total
              </Text>
            </TouchableOpacity>
          )}
        />
        {loadingDetail && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#1A73E8" size="large" />
          </View>
        )}
      </View>
    );
  }

  // ================================================================
  // RENDER: Item List
  // ================================================================
  if (step === 'itemList' && selectedSlip) {
    return (
      <View style={styles.container}>
        {scannerVisible && (
          <View style={StyleSheet.absoluteFill}>
            <QrScanner
              onScan={handleQRScan}
              onClose={() => setScannerVisible(false)}
              title="Scan Bin QR"
              subtitle="Scan the bin location to complete put-away"
            />
          </View>
        )}

        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← Slips</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedSlip.slip_number}</Text>
          <Text style={styles.headerSubtitle}>
            {slipItems.length} item(s) to put away
            {selectedSlip.asn_order_no && ` · ${selectedSlip.asn_order_no}`}
          </Text>
        </View>

        <FlatList
          data={slipItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyText}>All items put away!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const flagColor =
              item.flag === 'damaged' ? '#F59E0B' : item.flag === 'short' ? '#EF4444' : '#10B981';

            return (
              <View style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemSku}>{item.sku}</Text>
                    <Text style={styles.itemBatch}>Batch: {item.batch_number}</Text>
                  </View>
                  <View style={[styles.flagBadge, { backgroundColor: flagColor }]}>
                    <Text style={styles.flagText}>{item.flag}</Text>
                  </View>
                </View>

                <View style={styles.itemDetails}>
                  <View style={styles.itemDetailRow}>
                    <Text style={styles.itemDetailLabel}>Qty:</Text>
                    <Text style={styles.itemDetailValue}>{item.quantity}</Text>
                  </View>
                  <View style={styles.itemDetailRow}>
                    <Text style={styles.itemDetailLabel}>Boxes:</Text>
                    <Text style={styles.itemDetailValue}>{item.box_count}</Text>
                  </View>
                </View>

                <View style={styles.itemActions}>
                  <TouchableOpacity
                    style={styles.putAwayButton}
                    onPress={() => handleSelectItem(item)}
                  >
                    <Text style={styles.putAwayButtonText}>📋 Suggest Bins</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.scanBinButton}
                    onPress={() => handleScanBin(item)}
                  >
                    <Text style={styles.scanBinButtonText}>📷 Scan Bin</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      </View>
    );
  }

  // ================================================================
  // RENDER: Bin Suggestions
  // ================================================================
  if (step === 'suggestBins' && activeItem && selectedSlip) {
    return (
      <View style={styles.container}>
        {scannerVisible && (
          <View style={StyleSheet.absoluteFill}>
            <QrScanner
              onScan={handleQRScan}
              onClose={() => setScannerVisible(false)}
              title="Scan Bin QR"
              subtitle="Scan the bin location to complete put-away"
            />
          </View>
        )}

        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← Items</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bin Suggestions</Text>
          <Text style={styles.headerSubtitle}>
            {activeItem.sku} · Qty: {activeItem.quantity} · Batch: {activeItem.batch_number}
          </Text>
        </View>

        {loadingFifo && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#1A73E8" size="large" />
            <Text style={styles.loadingText}>Finding best bins...</Text>
          </View>
        )}

        {!loadingFifo && (
          <FlatList
            data={fifoBins}
            keyExtractor={(bin) => bin.bin_id}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>
                  {fifoBins.length > 0
                    ? `🏆 ${fifoBins.length} bin(s) already hold this SKU (FIFO sorted)`
                    : 'No bins currently hold this SKU'}
                </Text>
                <Text style={styles.sectionHeaderSub}>
                  Oldest stock first — helps with consolidation
                </Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyBins}>
                <Text style={styles.emptyBinsText}>No existing bins found for {activeItem.sku}</Text>
                <Text style={styles.emptyBinsSub}>Scan a bin QR instead</Text>
              </View>
            }
            renderItem={({ item: bin, index }) => (
              <TouchableOpacity
                style={styles.binCard}
                onPress={() =>
                  Alert.alert(
                    'Confirm Put-Away',
                    `Put ${activeItem.sku} (Qty: ${activeItem.quantity}) into ${bin.bin_path}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Confirm',
                        onPress: () => handleAssignBin(bin.bin_id, bin.bin_path),
                      },
                    ]
                  )
                }
                disabled={assigningItem === activeItem.id}
              >
                <View style={styles.binRankBadge}>
                  <Text style={styles.binRankText}>{index === 0 ? '★' : `#${index + 1}`}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.binPath}>{bin.bin_path}</Text>
                  <View style={styles.binMeta}>
                    <Text style={styles.binMetaText}>
                      📦 {bin.quantity_on_hand} on hand
                    </Text>
                    <Text style={styles.binMetaText}>
                      🕐 {bin.stock_age_days}d old
                    </Text>
                  </View>
                </View>
                {assigningItem === activeItem.id ? (
                  <ActivityIndicator color="#1A73E8" size="small" />
                ) : (
                  <Text style={styles.binSelectArrow}>→</Text>
                )}
              </TouchableOpacity>
            )}
            ListFooterComponent={
              <TouchableOpacity
                style={styles.scanBinFooter}
                onPress={() => setScannerVisible(true)}
              >
                <Text style={styles.scanBinFooterText}>📷 Or scan a different bin QR</Text>
              </TouchableOpacity>
            }
          />
        )}
      </View>
    );
  }

  return null;
}

// ================================================================
// STYLES
// ================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#1A2332',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 8 },
  headerSubtitle: { color: '#8899AA', fontSize: 14, marginTop: 4 },
  backButton: { color: '#1A73E8', fontSize: 16, fontWeight: '600' },

  listContent: { padding: 24, paddingBottom: 40 },

  // ── Select Slip ──
  slipCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  slipCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  slipNumber: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statusBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  slipAsn: { color: '#60A5FA', fontSize: 13, marginBottom: 4 },
  slipDetail: { color: '#8899AA', fontSize: 13 },

  // ── Item List ──
  itemCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  itemSku: { color: '#fff', fontSize: 17, fontWeight: '700' },
  itemBatch: { color: '#8899AA', fontSize: 12, marginTop: 2 },
  flagBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  flagText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  itemDetails: { marginBottom: 14, gap: 6 },
  itemDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetailLabel: { color: '#667788', fontSize: 13, width: 50 },
  itemDetailValue: {
    color: '#B0C4D8',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },

  itemActions: { flexDirection: 'row', gap: 10 },
  putAwayButton: {
    flex: 2,
    backgroundColor: '#1A73E8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  putAwayButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scanBinButton: {
    flex: 1,
    backgroundColor: '#1A3A5C',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanBinButtonText: { color: '#60A5FA', fontSize: 14, fontWeight: '500' },

  // ── Bin Suggestions ──
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { color: '#8899AA', fontSize: 14, marginTop: 12 },
  sectionHeader: { marginBottom: 16 },
  sectionHeaderText: { color: '#B0C4D8', fontSize: 15, fontWeight: '600' },
  sectionHeaderSub: { color: '#667788', fontSize: 12, marginTop: 4 },

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
  binRankBadge: {
    backgroundColor: '#1A73E8',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  binRankText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  binPath: { color: '#fff', fontSize: 15, fontWeight: '600' },
  binMeta: { flexDirection: 'row', gap: 16, marginTop: 4 },
  binMetaText: { color: '#667788', fontSize: 12 },
  binSelectArrow: { color: '#1A73E8', fontSize: 20, fontWeight: '700' },

  emptyBins: { padding: 30, alignItems: 'center' },
  emptyBinsText: { color: '#8899AA', fontSize: 15, fontWeight: '500' },
  emptyBinsSub: { color: '#667788', fontSize: 13, marginTop: 8 },

  scanBinFooter: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  scanBinFooterText: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },

  // ── Misc ──
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#8899AA', fontSize: 18, fontWeight: '600' },
  emptySubtext: { color: '#667788', fontSize: 14, marginTop: 8, textAlign: 'center' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

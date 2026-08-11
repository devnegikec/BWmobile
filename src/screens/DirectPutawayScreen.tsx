// ============================================================
// Direct Put-Away — Dual-Axis QR-based (no slip context)
// Scan the same QR that was scanned during inbound → lookup
// tracking row → enter bin → complete put-away
// ============================================================
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as putawayService from '../api/putawayService';
import QrScanner from '../components/QrScanner';
import type { TrackingItem } from '../types';

type ViewState = 'scanning' | 'itemFound';

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse } = useAuthStore();

  const [viewState, setViewState] = useState<ViewState>('scanning');
  const [tracking, setTracking] = useState<TrackingItem | null>(null);
  const [binId, setBinId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [lastScannedQr, setLastScannedQr] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Prevent duplicate scan triggers
  const scanLockRef = useRef(false);

  // ================================================================
  // Handle QR scan — lookup tracking row
  // ================================================================
  const handleScan = useCallback(
    async (data: string) => {
      const qr = data.trim();
      if (!qr || scanLockRef.current) return;
      scanLockRef.current = true;

      setLastScannedQr(qr);
      setErrorMsg(null);
      setIsLoading(true);

      try {
        const result = await putawayService.lookupTrackingByQr(qr);

        if (!result) {
          setErrorMsg(`QR "${qr}" not found in any inbound session.`);
          setIsLoading(false);
          scanLockRef.current = false;
          return;
        }

        if (result.putaway_status === 'completed') {
          setErrorMsg(`"${result.sku}" already put away.`);
          setIsLoading(false);
          scanLockRef.current = false;
          return;
        }

        if (result.receiving_status === 'rejected') {
          setErrorMsg(`"${result.sku}" was rejected. Cannot put away.`);
          setIsLoading(false);
          scanLockRef.current = false;
          return;
        }

        // Valid tracking row — show item details
        setTracking(result);
        setBinId('');
        setViewState('itemFound');
      } catch {
        setErrorMsg('Failed to look up QR. Try again.');
      } finally {
        setIsLoading(false);
        scanLockRef.current = false;
      }
    },
    []
  );

  // ================================================================
  // Complete put-away
  // ================================================================
  const handleComplete = async () => {
    const bid = binId.trim();
    if (!bid) { Alert.alert('Error', 'Enter a bin ID first.'); return; }
    if (!tracking) return;

    setIsCompleting(true);
    try {
      const result = await putawayService.completePutawayByQr({
        qr: tracking.qr_identifier,
        bin_id: bid,
        quantity: tracking.quantity,
      });

      setCompletedCount((c) => c + 1);

      const stockMsg = result.stock_entered
        ? ' Stock entered — item is now pickable!'
        : ' (awaiting admin approval for stock entry)';

      Alert.alert(
        'Done',
        `${result.sku} → ${bid}${stockMsg}`,
        [{ text: 'OK' }]
      );

      // Back to scanning
      setTracking(null);
      setBinId('');
      setViewState('scanning');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to complete put-away.');
    } finally {
      setIsCompleting(false);
    }
  };

  // ================================================================
  // Cancel — back to scan
  // ================================================================
  const handleCancel = () => {
    setTracking(null);
    setBinId('');
    setErrorMsg(null);
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
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>Direct Put-Away</Text>
          <Text style={styles.topBarSub}>
            Scan item QR to put away
            {completedCount > 0 ? ` · ${completedCount} done` : ''}
          </Text>
        </View>
        {completedCount > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{completedCount}</Text>
          </View>
        )}
      </View>

      {/* ── Scanning ── */}
      {viewState === 'scanning' && (
        <View style={styles.scannerContainer}>
          {isLoading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#1A73E8" size="large" />
              <Text style={styles.loadingText}>Looking up "{lastScannedQr}"...</Text>
            </View>
          ) : (
            <QrScanner
              onScan={handleScan}
              title="Scan Item QR"
              subtitle="Scan the same QR used during inbound receiving"
            />
          )}

          {/* Error */}
          {errorMsg && (
            <View style={styles.errorToast}>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity onPress={() => setErrorMsg(null)}>
                <Text style={styles.errorDismiss}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── Item Found ── */}
      {viewState === 'itemFound' && tracking && (
        <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
          {/* Item card */}
          <View style={styles.itemCard}>
            <Text style={styles.itemLabel}>ITEM</Text>
            <Text style={styles.itemSku}>{tracking.sku}</Text>
            {tracking.batch_number && (
              <Text style={styles.itemBatch}>Batch: {tracking.batch_number}</Text>
            )}
            <View style={styles.itemMeta}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>Qty: {tracking.quantity}</Text>
              </View>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>
                  Receiving: {tracking.receiving_status}
                </Text>
              </View>
            </View>
            {tracking.receiving_status === 'approved' && (
              <Text style={styles.stockNote}>✅ Approved — stock will enter after put-away</Text>
            )}
            {tracking.receiving_status === 'scanned' && (
              <Text style={styles.stockNotePending}>
                ⏳ Pending admin approval — stock enters after both axes complete
              </Text>
            )}
          </View>

          {/* Bin input */}
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
                editable={!isCompleting}
              />
              <TouchableOpacity
                style={[
                  styles.completeBtn,
                  !binId.trim() ? styles.completeBtnDisabled : styles.completeBtnActive,
                ]}
                onPress={handleComplete}
                disabled={!binId.trim() || isCompleting}
              >
                {isCompleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.completeBtnText}>
                    {binId.trim() ? 'Complete' : 'Enter Bin'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>← Scan different item</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  countBadge: { backgroundColor: '#10B981', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Scanner
  scannerContainer: { flex: 1 },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    backgroundColor: 'rgba(15,25,35,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  loadingText: { color: '#8899AA', fontSize: 15, marginTop: 12 },

  // Error toast
  errorToast: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorText: { color: '#FCA5A5', fontSize: 14, flex: 1 },
  errorDismiss: { color: '#FCA5A5', fontSize: 16, fontWeight: '700', paddingLeft: 12 },

  // Detail
  detailScroll: { flex: 1 },
  detailContent: { padding: 16, gap: 16 },

  // Item card
  itemCard: {
    backgroundColor: '#1A2332', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#2A3A4A',
  },
  itemLabel: { color: '#667788', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  itemSku: { color: '#fff', fontSize: 22, fontWeight: '700' },
  itemBatch: { color: '#8899AA', fontSize: 14, marginTop: 4 },
  itemMeta: { flexDirection: 'row', gap: 8, marginTop: 12 },
  metaChip: {
    backgroundColor: '#0F1923', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  metaChipText: { color: '#B0C4D8', fontSize: 13, fontWeight: '500' },
  stockNote: { color: '#10B981', fontSize: 12, marginTop: 10, fontStyle: 'italic' },
  stockNotePending: { color: '#F59E0B', fontSize: 12, marginTop: 10, fontStyle: 'italic' },

  // Bin input
  binSection: { gap: 8 },
  binLabel: { color: '#667788', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  binRow: { flexDirection: 'row', gap: 10 },
  binInput: {
    flex: 1,
    backgroundColor: '#1A2332', borderRadius: 12, borderWidth: 1, borderColor: '#2A3A4A',
    color: '#fff', fontSize: 18, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  completeBtn: { borderRadius: 12, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  completeBtnDisabled: { backgroundColor: '#374151' },
  completeBtnActive: { backgroundColor: '#10B981' },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Cancel
  cancelBtn: {
    backgroundColor: '#1A3A5C', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  cancelBtnText: { color: '#60A5FA', fontSize: 15, fontWeight: '600' },
});

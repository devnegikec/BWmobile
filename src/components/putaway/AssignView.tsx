// ============================================================
// AssignView — Bin input + Scanner overlay + AssignTable + Assign All
// ============================================================
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator,
  Modal, StyleSheet, ScrollView,
} from 'react-native';
import QrScanner from '@/components/QrScanner';
import { parseBinQR, lookupBinByQr, BinInfo } from '@/components/putaway/binScanner';
import { isQSealUrl } from '@/components/putaway/qrHelpers';

export interface AssignViewRenderContext {
  bin: BinInfo | null;
  openScanner: () => void;
}

interface Props {
  title: string;
  subtitle?: string;
  isAssigning: boolean;
  doneCount: number;
  pendingCount: number;
  onAssignAll: (locationId: string, binLabel: string) => void;
  onScanQSeal?: (data: string) => void;
  onBack: () => void;
  children: (ctx: AssignViewRenderContext) => React.ReactNode;
}

export default function AssignView({
  title, subtitle, isAssigning, doneCount, pendingCount,
  onAssignAll, onScanQSeal, onBack, children,
}: Props) {
  const [binCode, setBinCode] = useState('');
  const [resolvedBin, setResolvedBin] = useState<BinInfo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);

  // ── Resolve bin code → UUID ──
  const resolveBin = useCallback(async (code: string): Promise<BinInfo | null> => {
    const parsed = parseBinQR(code);
    if (!parsed) {
      Alert.alert('Invalid Code', 'Scanned code is not a valid bin QR. Please scan a bin label.');
      return null;
    }
    if (parsed.location_id) {
      setResolvedBin(parsed);
      return parsed;
    }
    setResolving(true);
    const info = await lookupBinByQr(parsed.qr_code);
    setResolving(false);
    if (!info) {
      Alert.alert('Bin Not Found', `No warehouse location for code "${parsed.qr_code}".`);
      return null;
    }
    setResolvedBin(info);
    return info;
  }, []);

  // ── Handle scanned data (bin QR or QSeal) ──
  const handleScanned = useCallback((data: string) => {
    setScanning(false);
    if (onScanQSeal && isQSealUrl(data)) {
      onScanQSeal(data);
      return;
    }
    resolveBin(data);
  }, [resolveBin, onScanQSeal]);

  // ── Manual bin code entry ──
  const handleManualSubmit = useCallback(async () => {
    const code = binCode.trim();
    if (!code) return;
    setBinCode('');
    await resolveBin(code);
  }, [binCode, resolveBin]);

  // ── Assign all ──
  const handleAssignAll = useCallback(() => {
    if (!resolvedBin?.location_id) {
      Alert.alert('No Bin', 'Scan or enter a bin code first.');
      return;
    }
    onAssignAll(resolvedBin.location_id, resolvedBin.full_path || resolvedBin.location_code || resolvedBin.qr_code);
    setResolvedBin(null);
  }, [resolvedBin, onAssignAll]);

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Bin input row ── */}
      <View style={styles.binRow}>
        <View style={styles.binInputContainer}>
          <Text style={styles.cubeIcon}>📦</Text>
          <TextInput
            style={styles.binInput}
            placeholder="Enter or scan bin code..."
            placeholderTextColor="#6B7280"
            value={binCode}
            onChangeText={setBinCode}
            onSubmitEditing={handleManualSubmit}
            autoCapitalize="characters"
            returnKeyType="go"
          />
          <TouchableOpacity onPress={() => setScanning(true)} style={styles.scanBtn}>
            <Text style={styles.scanIcon}>📷</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.goBtn, !binCode.trim() && styles.goBtnDisabled]}
          onPress={handleManualSubmit}
          disabled={!binCode.trim()}
        >
          <Text style={styles.goBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {/* ── Resolving spinner ── */}
      {resolving && (
        <View style={styles.resolvingRow}>
          <ActivityIndicator size="small" color="#60A5FA" />
          <Text style={styles.resolvingText}>Looking up bin...</Text>
        </View>
      )}

      {/* ── Resolved bin + Assign All ── */}
      {resolvedBin && !resolving && (
        <View style={styles.resolvedRow}>
          <View style={styles.resolvedInfo}>
            <Text style={styles.checkIcon}>✅</Text>
            <Text style={styles.resolvedPath} numberOfLines={1}>
              {resolvedBin.full_path || resolvedBin.location_code || resolvedBin.qr_code}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.assignAllBtn, isAssigning && styles.btnDisabled]}
            onPress={handleAssignAll}
            disabled={isAssigning}
          >
            {isAssigning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.assignIcon}>📥</Text>
                <Text style={styles.assignAllText}>Assign All</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Table (provided by parent) ── */}
      <View style={styles.tableWrap}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {children({ bin: resolvedBin, openScanner: () => setScanning(true) })}
        </ScrollView>
      </View>

      {/* ── Persistent footer ── */}
      <View style={styles.footer}>
        <Text style={styles.footerStat}>✅ {doneCount} done</Text>
        <View style={styles.footerDivider} />
        <Text style={styles.footerStat}>⏳ {pendingCount} pending</Text>
      </View>

      {/* ── Scanner modal ── */}
      <Modal visible={scanning} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.scannerContainer}>
          <QrScanner
            onScan={handleScanned}
            onClose={() => setScanning(false)}
          />
          <TouchableOpacity
            style={styles.scannerCloseBtn}
            onPress={() => setScanning(false)}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
  },
  backBtn: { padding: 6 },
  backIcon: { color: '#fff', fontSize: 28, lineHeight: 30 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff', textAlign: 'center' },
  headerSubtitle: { fontSize: 12, color: '#8899AA', marginTop: 2, textAlign: 'center' },
  headerTextWrap: { flex: 1, alignItems: 'center' },

  binRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1F2937', borderRadius: 12, margin: 16, marginTop: 0,
    padding: 4, paddingLeft: 12,
  },
  binInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cubeIcon: { marginRight: 6, fontSize: 16 },
  binInput: { flex: 1, fontSize: 16, color: '#F9FAFB', paddingVertical: 10 },
  scanBtn: { padding: 8 },
  scanIcon: { fontSize: 18 },
  goBtn: {
    backgroundColor: '#2563EB', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  goBtnDisabled: { backgroundColor: '#1E3A5F' },
  goBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  resolvingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8, padding: 8,
  },
  resolvingText: { color: '#9CA3AF', fontSize: 14 },

  resolvedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#064E3B', borderRadius: 10, padding: 12,
  },
  resolvedInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  checkIcon: { fontSize: 16 },
  resolvedPath: { fontSize: 14, color: '#34D399', fontWeight: '500', flex: 1 },
  tableWrap: { flex: 1, paddingHorizontal: 16 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#1A2332',
    borderTopWidth: 1,
    borderTopColor: '#2A3A4A',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  footerStat: { color: '#B0C4D8', fontSize: 14, fontWeight: '600' },
  footerDivider: { width: 1, height: 16, backgroundColor: '#2A3A4A' },
  assignAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  btnDisabled: { opacity: 0.5 },
  assignIcon: { fontSize: 14 },
  assignAllText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerCloseBtn: {
    position: 'absolute', top: 50, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8,
  },
  closeIcon: { color: '#fff', fontSize: 24, lineHeight: 26 },
});

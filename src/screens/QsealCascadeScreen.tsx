// ============================================================
// QSeal Cascade Screen — Parent-Child QR Linking
// Continuous scanning (like AssignBin). First scan = parent, rest = children.
// Only the final "Link" hits the backend.
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
  Platform,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useQSealStore } from '../store/qsealStore';
import QrScanner from '../components/QrScanner';
import * as qsealService from '../api/qsealService';

type Phase = 'idle' | 'scanning' | 'review' | 'submitting' | 'success';

// ---- Serial number extraction ----
// URL pattern: https://v0-horizon-sync.vercel.app/g/{sku}/s/{SERIAL}/{...}?c=...
// The serial is the path segment immediately after /s/
function extractSerial(data: string): string | null {
  const trimmed = data.trim();

  // If it's a URL, parse the path
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const pathParts = url.pathname.split('/').filter(Boolean);

      // Find /s/ segment — serial is the next segment
      const sIdx = pathParts.indexOf('s');
      if (sIdx !== -1 && sIdx + 1 < pathParts.length) {
        return pathParts[sIdx + 1];
      }

      // Fallback: last path segment (if it looks like a serial, not a number-only timestamp)
      if (pathParts.length > 0) {
        const last = pathParts[pathParts.length - 1];
        // Skip pure-numeric segments (likely timestamps like 1785994326500)
        if (last && !/^\d{10,}$/.test(last)) {
          return last;
        }
        // Second-to-last if last is numeric
        if (pathParts.length >= 2) {
          const secondLast = pathParts[pathParts.length - 2];
          if (secondLast && !/^\d+$/.test(secondLast)) {
            return secondLast;
          }
        }
      }

      return null;
    } catch {
      // Fall through to raw string handling
    }
  }

  // Raw serial (e.g., "JV9HKW" or "QSL7A3B2C1D")
  if (trimmed.length >= 2 && trimmed.length <= 50) {
    return trimmed;
  }

  return null;
}

export default function QsealCascadeScreen({ navigation }: any) {
  const { user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  const {
    parent,
    children,
    isSubmitting,
    lastMapResult,
    error,
    setParent,
    addChild,
    removeChild,
    finalizeCascade,
    resetCascade,
    clearError,
  } = useQSealStore();

  const [phase, setPhase] = useState<Phase>('idle');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // ---- Handle QR scan (calls POST /qseal/scan to get UUID, then stores locally) ----
  const handleScan = useCallback(
    async (data: string) => {
      clearError();

      const serial = extractSerial(data);
      if (!serial) {
        Alert.alert('Invalid QR', 'Could not extract a serial number from this QR code.');
        return;
      }

      setIsScanning(true);
      try {
        const node = await qsealService.scanQSeal(orgId, {
          serial_number: serial,
          device_type: Platform.OS,
          os: Platform.OS === 'ios' ? `iOS ${Platform.Version}` : `Android ${Platform.Version}`,
          ip_address: '',
        });

        setLastScanned(serial);

        // First scan → set as parent, subsequent scans → children
        if (!parent) {
          setParent(serial, node.node_id);
        } else {
          addChild(serial, node.node_id);
        }
      } catch (err: any) {
        const detail =
          err?.response?.data?.detail || err?.message || 'Failed to look up QSeal.';
        const msg = typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail));
        Alert.alert('Scan Error', msg);
      } finally {
        setIsScanning(false);
      }
    },
    [orgId, parent, setParent, addChild, clearError]
  );

  // ---- Review → finalize (sends map request to backend) ----
  const handleFinalize = async () => {
    setPhase('submitting');
    const result = await finalizeCascade();
    if (result) {
      setPhase('success');
    } else {
      Alert.alert('Link Failed', error || 'Failed to link QSeals.');
      setPhase('review');
    }
  };

  // ---- Start new session ----
  const handleNewSession = () => {
    resetCascade();
    setLastScanned(null);
    setPhase('idle');
  };

  const handleStartScan = () => {
    resetCascade();
    setLastScanned(null);
    setPhase('scanning');
  };

  // ============ RENDER: Idle ============
  if (phase === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Link Parent & Child</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.idleContent}>
          <Text style={styles.idleIcon}>🔗</Text>
          <Text style={styles.idleTitle}>QSeal Cascade</Text>
          <Text style={styles.idleSubtitle}>
            Scan a parent QSeal first, then scan child QSeals.{'\n'}
            Each scan resolves the serial number against the backend.
          </Text>
          <TouchableOpacity style={styles.idleScanBtn} onPress={handleStartScan}>
            <Text style={styles.idleScanBtnText}>Start Scanning</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============ RENDER: Scanning ============
  if (phase === 'scanning') {
    const totalCount = (parent ? 1 : 0) + children.length;

    return (
      <View style={styles.container}>
        {/* Status bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusLeft}>
            <Text style={styles.statusLabel}>
              {parent ? '🔒 Parent set' : '📱 Waiting for parent'}
            </Text>
            {parent && (
              <Text style={styles.statusParentSerial} numberOfLines={1}>
                {parent.serialNumber}
              </Text>
            )}
          </View>
          <View style={styles.statusRight}>
            <Text style={styles.statusCount}>{totalCount}</Text>
            <Text style={styles.statusCountLabel}>scans</Text>
          </View>
        </View>

        {/* Last scanned feedback + loading indicator */}
        {(lastScanned || isScanning) && (
          <View style={[styles.scanToast, isScanning && styles.scanToastLoading]}>
            {isScanning ? (
              <View style={styles.scanToastRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.scanToastText}> Resolving...</Text>
              </View>
            ) : (
              <Text style={styles.scanToastText}>
                ✅ {lastScanned}
                {parent && lastScanned === parent.serialNumber ? ' (Parent)' : ' (Child)'}
              </Text>
            )}
          </View>
        )}

        {/* QR Scanner */}
        <QrScanner
          onScan={handleScan}
          title={parent ? 'Scan Child QSeals' : 'Scan Parent QSeal'}
          subtitle={
            parent
              ? `${children.length} child serial(s) scanned`
              : 'First scan will be set as the parent'
          }
        />

        {/* Bottom actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleNewSession}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (!parent || children.length === 0) && styles.buttonDisabled,
            ]}
            onPress={() => setPhase('review')}
            disabled={!parent || children.length === 0}
          >
            <Text style={styles.primaryButtonText}>
              Review ({children.length} children)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============ RENDER: Review ============
  if (phase === 'review') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setPhase('scanning')} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Scan</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Cascade</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.reviewContent}>
          {/* Parent card */}
          {parent && (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewSectionTitle}>Parent</Text>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Serial</Text>
                <Text style={styles.reviewValueMono}>{parent.serialNumber}</Text>
              </View>
            </View>
          )}

          {/* Children list */}
          <View style={styles.reviewCard}>
            <Text style={styles.reviewSectionTitle}>
              Children ({children.length})
            </Text>
            {children.length === 0 ? (
              <Text style={styles.emptyText}>No children scanned yet.</Text>
            ) : (
              children.map((child, idx) => (
                <View key={child.serialNumber} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemIndex}>#{idx + 1}</Text>
                    <Text style={styles.itemSerial}>{child.serialNumber}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeChild(child.serialNumber)}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Actions */}
          <TouchableOpacity
            style={[styles.linkCompleteBtn, isSubmitting && styles.buttonDisabled]}
            onPress={handleFinalize}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.linkCompleteBtnText}>
                Link Complete ({children.length} child{children.length > 1 ? 'ren' : ''})
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.addMoreBtn} onPress={() => setPhase('scanning')}>
            <Text style={styles.addMoreBtnText}>+ Add More Children</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ============ RENDER: Submitting ============
  if (phase === 'submitting') {
    return (
      <View style={styles.container}>
        <View style={styles.idleContent}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={styles.submittingText}>Linking QSeals...</Text>
          <Text style={styles.submittingDetail}>
            {parent?.serialNumber} ← {children.length} child serial(s)
          </Text>
        </View>
      </View>
    );
  }

  // ============ RENDER: Success ============
  if (phase === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Cascade Complete</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.idleContent}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Linked Successfully</Text>
          <Text style={styles.successMessage}>
            {lastMapResult?.mapped_count} child QSeal(s) linked to parent{' '}
            {parent?.serialNumber || ''}.
          </Text>

          <TouchableOpacity style={styles.idleScanBtn} onPress={handleNewSession}>
            <Text style={styles.idleScanBtnText}>New Cascade</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.idleScanBtn, styles.doneBtn]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.idleScanBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },

  // ---- Header ----
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A2332',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
    paddingTop: 55,
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4, minWidth: 50 },
  backBtnText: { color: '#1A73E8', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // ---- Idle ----
  idleContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  idleIcon: { fontSize: 56, marginBottom: 16 },
  idleTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 12 },
  idleSubtitle: {
    color: '#8899AA',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  idleScanBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
  },
  idleScanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  doneBtn: { backgroundColor: '#1A2332', borderWidth: 1, borderColor: '#2A3A4A', marginTop: 12 },

  // ---- Scanning ----
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 55,
    backgroundColor: '#1A2332',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  statusLeft: { flex: 1 },
  statusLabel: { color: '#8899AA', fontSize: 13, fontWeight: '600' },
  statusParentSerial: {
    color: '#1A73E8',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  statusRight: { alignItems: 'center' },
  statusCount: { color: '#fff', fontSize: 24, fontWeight: '800' },
  statusCountLabel: { color: '#667788', fontSize: 10, fontWeight: '600' },

  scanToast: {
    position: 'absolute',
    top: 55 + 52,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(34,197,94,0.9)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  scanToastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scanToastLoading: { backgroundColor: 'rgba(26,115,232,0.9)' },
  scanToastRow: { flexDirection: 'row', alignItems: 'center' },

  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 20,
    gap: 12,
    backgroundColor: '#1A2332',
    borderTopWidth: 1,
    borderTopColor: '#2A3A4A',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#8899AA', fontSize: 14, fontWeight: '600' },
  primaryButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },

  // ---- Review ----
  content: { flex: 1 },
  reviewContent: { padding: 16, paddingBottom: 40 },
  reviewCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  reviewSectionTitle: {
    color: '#8899AA',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  reviewLabel: { color: '#667788', fontSize: 13 },
  reviewValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  reviewValueMono: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  emptyText: { color: '#667788', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  itemInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  itemIndex: { color: '#1A73E8', fontSize: 13, fontWeight: '700', width: 32 },
  itemSerial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },

  // ---- Review Actions ----
  linkCompleteBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  linkCompleteBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addMoreBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  addMoreBtnText: { color: '#1A73E8', fontSize: 14, fontWeight: '600' },

  // ---- Submitting ----
  submittingText: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 20 },
  submittingDetail: { color: '#667788', fontSize: 13, marginTop: 8, textAlign: 'center' },

  // ---- Success ----
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 10 },
  successMessage: { color: '#B0C4D8', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
});

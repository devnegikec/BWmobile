// ============================================================
// QSeal Cascade Screen — Parent-Child QR Linking
// ============================================================
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useQSealStore } from '../store/qsealStore';
import QrScanner from '../components/QrScanner';
import * as qsealService from '../api/qsealService';
import type { QSealNode } from '../types';

const DEVICE_TYPE = Platform.OS;
const OS = Platform.OS === 'ios' ? `iOS ${Platform.Version}` : `Android ${Platform.Version}`;

export default function QsealCascadeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { selectedWarehouse, user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  const {
    parent,
    children,
    cascadeMode,
    isSubmitting,
    lastMapResult,
    error,
    isParentFull,
    remainingCapacity,
    addScannedNode,
    removeChild,
    finalizeCascade,
    resetCascade,
    clearError,
  } = useQSealStore();

  const [showScanner, setShowScanner] = useState(false);
  const [scannerTitle, setScannerTitle] = useState('Scan QSeal QR Code');
  const [scannerSubtitle, setScannerSubtitle] = useState('');
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [isScanningChild, setIsScanningChild] = useState(false);
  const prevChildrenLen = useRef(children.length);

  // ---- Auto-show link popup when: ----
  // 1. Child-first flow: parent is scanned after children exist
  // 2. Parent-first flow: capacity becomes full after adding a child
  useEffect(() => {
    // Child-first flow: parent just got set and we have children
    if (cascadeMode === 'child-first' && parent && children.length > 0 && !showLinkPopup) {
      // Small delay so the user sees the scan result first
      const timer = setTimeout(() => setShowLinkPopup(true), 600);
      return () => clearTimeout(timer);
    }

    // Parent-first flow: capacity just got full
    if (cascadeMode === 'parent-first' && parent && children.length > prevChildrenLen.current && isParentFull()) {
      const timer = setTimeout(() => setShowLinkPopup(true), 600);
      prevChildrenLen.current = children.length;
      return () => clearTimeout(timer);
    }

    prevChildrenLen.current = children.length;
  }, [parent, children.length, cascadeMode]);

  // ---- Auto-show success popup ----
  useEffect(() => {
    if (lastMapResult) {
      setShowSuccessPopup(true);
    }
  }, [lastMapResult]);

  // ---- Handle QR scan ----
  const handleScan = useCallback(
    async (data: string) => {
      setShowScanner(false);
      clearError();

      // Extract serial number from QR data
      // QR may contain a URL like https://app.example.com/qseal/QSL7A3B2C1D
      // or just a raw serial like QSL7A3B2C1D
      let serialNumber = data.trim();
      if (serialNumber.includes('/')) {
        const parts = serialNumber.split('/');
        serialNumber = parts[parts.length - 1];
      }
      // Remove any query params
      if (serialNumber.includes('?')) {
        serialNumber = serialNumber.split('?')[0];
      }

      if (!serialNumber) {
        Alert.alert('Invalid QR', 'Could not extract a serial number from the QR code.');
        return;
      }

      try {
        const node = await qsealService.scanQSeal(orgId, {
          serial_number: serialNumber,
          device_type: DEVICE_TYPE,
          os: OS,
          ip_address: '',
        });

        await addScannedNode(node);
      } catch (err: any) {
        const detail = err.response?.data?.detail || err.message || 'Failed to scan QSeal.';
        Alert.alert('Scan Error', detail);
      }
    },
    [orgId, addScannedNode, clearError]
  );

  // ---- Open scanner for parent ----
  const handleScanParent = () => {
    if (parent) {
      Alert.alert(
        'Parent Already Set',
        'A parent is already selected. Reset the cascade first to scan a new parent.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: resetCascade },
        ]
      );
      return;
    }
    setScannerTitle('Scan Parent QSeal');
    setScannerSubtitle('Scan a Container, Pallet, or Shipper QR');
    setIsScanningChild(false);
    setShowScanner(true);
  };

  // ---- Open scanner for child ----
  const handleScanChild = () => {
    if (!parent && cascadeMode === 'none') {
      // No parent yet — this will be child-first mode
      setScannerTitle('Scan Child QSeal');
      setScannerSubtitle('Scan child QR codes (Box, Unit, Shipper)');
      setIsScanningChild(true);
      setShowScanner(true);
      return;
    }

    if (parent && isParentFull()) {
      Alert.alert(
        'Capacity Full',
        `Parent ${parent.name} is at full capacity (${parent.children_count}/${parent.capacity}). No more children can be added.`,
        [{ text: 'OK' }]
      );
      return;
    }

    setScannerTitle('Scan Child QSeal');
    setScannerSubtitle(parent ? `Linking to: ${parent.name}` : 'Scan child QR codes');
    setIsScanningChild(true);
    setShowScanner(true);
  };

  // ---- Handle link / finalize ----
  const handleFinalize = async () => {
    setShowLinkPopup(false);
    const result = await finalizeCascade();
    if (!result) {
      // Error is already set in store
      Alert.alert('Link Failed', error || 'Failed to link QSeals.');
    }
  };

  // ---- Dismiss success popup ----
  const handleDismissSuccess = () => {
    setShowSuccessPopup(false);
    // Don't fully reset — keep parent so user can continue adding more children
    useQSealStore.setState({ lastMapResult: null });
  };

  // ---- Render parent capacity bar ----
  const renderCapacityBar = () => {
    if (!parent || parent.capacity == null) return null;

    const totalAfter = parent.children_count + children.length;
    const pct = Math.min(100, (totalAfter / parent.capacity) * 100);
    const isFull = totalAfter >= parent.capacity;
    const isNearFull = pct >= 80 && !isFull;

    return (
      <View style={styles.capacitySection}>
        <View style={styles.capacityLabels}>
          <Text style={styles.capacityText}>Capacity</Text>
          <Text style={[styles.capacityCount, isFull && styles.capacityCountFull]}>
            {totalAfter}/{parent.capacity}
            {isFull ? ' FULL' : ''}
          </Text>
        </View>
        <View style={styles.capacityBarBg}>
          <View
            style={[
              styles.capacityBarFill,
              {
                width: `${pct}%`,
                backgroundColor: isFull ? '#EF4444' : isNearFull ? '#F59E0B' : '#22C55E',
              },
            ]}
          />
        </View>
        {isFull && (
          <Text style={styles.capacityWarning}>
            ⚠️ Parent is at full capacity. No more children can be added.
          </Text>
        )}
        {isNearFull && !isFull && (
          <Text style={styles.capacityNearFull}>
            Approaching capacity: {parent.capacity - totalAfter} slots remaining.
          </Text>
        )}
      </View>
    );
  };

  // ---- Determine if we can finalize ----
  const canFinalize = parent && children.length > 0 && !isSubmitting;
  const showManualLinkButton = cascadeMode === 'parent-first' && parent && children.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ---- Header ---- */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Link Parent & Child</Text>
        <TouchableOpacity onPress={resetCascade} style={styles.resetBtn}>
          <Text style={styles.resetBtnText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* ---- Flow indicator ---- */}
        {cascadeMode === 'none' && (
          <View style={styles.flowHint}>
            <Text style={styles.flowHintIcon}>🔗</Text>
            <Text style={styles.flowHintText}>
              Scan a parent or child QSeal to start. You can scan in any order.
            </Text>
          </View>
        )}

        {cascadeMode === 'child-first' && !parent && (
          <View style={styles.flowHint}>
            <Text style={styles.flowHintIcon}>📦</Text>
            <Text style={styles.flowHintText}>
              {children.length} child QSeal(s) scanned. Now scan the parent to link them.
            </Text>
          </View>
        )}

        {cascadeMode === 'parent-first' && parent && (
          <View style={styles.flowHint}>
            <Text style={styles.flowHintIcon}>📋</Text>
            <Text style={styles.flowHintText}>
              Parent selected. Scan child QSeals to add to the cascade.
            </Text>
          </View>
        )}

        {/* ---- Error banner ---- */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
            <TouchableOpacity onPress={clearError}>
              <Text style={styles.errorDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---- Parent Card ---- */}
        {parent && (
          <View style={styles.parentCard}>
            <View style={styles.parentCardHeader}>
              <Text style={styles.parentBadge}>PARENT</Text>
              <Text style={styles.parentType}>{parent.qseal_type.toUpperCase()}</Text>
            </View>
            <Text style={styles.parentName}>{parent.name}</Text>
            <Text style={styles.parentSerial}>{parent.serial_number}</Text>
            {renderCapacityBar()}
          </View>
        )}

        {/* ---- Children Batch ---- */}
        {children.length > 0 && (
          <View style={styles.childrenSection}>
            <Text style={styles.sectionTitle}>
              Children ({children.length})
            </Text>
            {children.map((child, idx) => (
              <View key={child.node_id} style={styles.childRow}>
                <View style={styles.childInfo}>
                  <Text style={styles.childIndex}>#{idx + 1}</Text>
                  <View style={styles.childDetails}>
                    <Text style={styles.childName}>{child.name}</Text>
                    <Text style={styles.childMeta}>
                      {child.serial_number} · {child.qseal_type}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.childRemoveBtn}
                  onPress={() => removeChild(child.node_id)}
                >
                  <Text style={styles.childRemoveBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ---- Action Buttons ---- */}
        <View style={styles.actions}>
          {/* Scan Parent Button */}
          {!parent && (
            <TouchableOpacity style={styles.scanBtn} onPress={handleScanParent}>
              <Text style={styles.scanBtnIcon}>🏷️</Text>
              <Text style={styles.scanBtnText}>Scan Parent QSeal</Text>
            </TouchableOpacity>
          )}

          {/* Scan Child Button */}
          <TouchableOpacity
            style={[styles.scanBtn, styles.scanChildBtn]}
            onPress={handleScanChild}
          >
            <Text style={styles.scanBtnIcon}>📦</Text>
            <Text style={styles.scanBtnText}>
              {parent && isParentFull() ? 'Parent Full' : 'Scan Child QSeal'}
            </Text>
          </TouchableOpacity>

          {/* Manual Link Complete Button (parent-first flow) */}
          {showManualLinkButton && (
            <TouchableOpacity
              style={[styles.linkBtn, isSubmitting && styles.btnDisabled]}
              onPress={() => setShowLinkPopup(true)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.linkBtnIcon}>✅</Text>
                  <Text style={styles.linkBtnText}>
                    Link Complete ({children.length} child
                    {children.length > 1 ? 'ren' : ''})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ---- QR Scanner Modal ---- */}
      <Modal
        visible={showScanner}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowScanner(false)}
      >
        <QrScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          title={scannerTitle}
          subtitle={scannerSubtitle}
        />
      </Modal>

      {/* ---- Link Confirmation Popup ---- */}
      <Modal
        visible={showLinkPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkPopup(false)}
      >
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <Text style={styles.popupIcon}>
              {isParentFull() && parent ? '⚠️' : '🔗'}
            </Text>
            <Text style={styles.popupTitle}>
              {isParentFull() && parent
                ? 'Capacity Limit Reached'
                : 'Link QSeals?'}
            </Text>

            {parent && (
              <View style={styles.popupInfo}>
                <Text style={styles.popupLabel}>Parent</Text>
                <Text style={styles.popupValue}>{parent.name} ({parent.serial_number})</Text>
                {parent.capacity != null && (
                  <Text style={[
                    styles.popupCapacity,
                    isParentFull() && styles.popupCapacityFull,
                  ]}>
                    Capacity: {parent.children_count + children.length}/{parent.capacity}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.popupInfo}>
              <Text style={styles.popupLabel}>Children to Link</Text>
              <Text style={styles.popupValue}>{children.length} QSeal(s)</Text>
            </View>

            {isParentFull() && parent && (
              <View style={styles.popupWarning}>
                <Text style={styles.popupWarningText}>
                  ⚠️ Parent capacity is full! Some children may not be linked if the count exceeds available slots.
                </Text>
              </View>
            )}

            {!isParentFull() && parent && parent.capacity != null && (
              <View style={styles.popupOk}>
                <Text style={styles.popupOkText}>
                  ✅ {parent.capacity - parent.children_count - children.length} slots remaining after this link.
                </Text>
              </View>
            )}

            <View style={styles.popupActions}>
              <TouchableOpacity
                style={styles.popupCancelBtn}
                onPress={() => setShowLinkPopup(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.popupCancelText}>
                  {isParentFull() ? 'Review' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.popupConfirmBtn, isSubmitting && styles.btnDisabled]}
                onPress={handleFinalize}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.popupConfirmText}>Link Now</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---- Success Popup ---- */}
      <Modal
        visible={showSuccessPopup}
        transparent
        animationType="fade"
        onRequestClose={handleDismissSuccess}
      >
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <Text style={styles.popupIcon}>✅</Text>
            <Text style={styles.popupTitle}>Cascade Complete</Text>
            <Text style={styles.popupMessage}>
              {lastMapResult?.mapped_count} QSeal(s) linked to {parent?.name || 'parent'}.
            </Text>
            <TouchableOpacity style={styles.popupConfirmBtn} onPress={handleDismissSuccess}>
              <Text style={styles.popupConfirmText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
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
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  backBtnText: {
    color: '#1A73E8',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  resetBtn: {
    paddingVertical: 4,
    paddingLeft: 12,
  },
  resetBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },

  // ---- Content ----
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 40,
  },

  // ---- Flow Hint ----
  flowHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  flowHintIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  flowHintText: {
    color: '#B0C4D8',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  // ---- Error Banner ----
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorBannerText: {
    color: '#EF4444',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  errorDismiss: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '700',
    paddingLeft: 8,
  },

  // ---- Parent Card ----
  parentCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  parentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  parentBadge: {
    color: '#1A73E8',
    fontSize: 11,
    fontWeight: '800',
    backgroundColor: 'rgba(26,115,232,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 8,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  parentType: {
    color: '#8899AA',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  parentName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  parentSerial: {
    color: '#667788',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
  },

  // ---- Capacity Bar ----
  capacitySection: {
    marginTop: 4,
  },
  capacityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  capacityText: {
    color: '#8899AA',
    fontSize: 12,
    fontWeight: '600',
  },
  capacityCount: {
    color: '#B0C4D8',
    fontSize: 13,
    fontWeight: '700',
  },
  capacityCountFull: {
    color: '#EF4444',
  },
  capacityBarBg: {
    height: 6,
    backgroundColor: '#2A3A4A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  capacityBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  capacityWarning: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  capacityNearFull: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  },

  // ---- Children Section ----
  childrenSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#8899AA',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A2332',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  childInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  childIndex: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '700',
    width: 30,
  },
  childDetails: {
    flex: 1,
  },
  childName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  childMeta: {
    color: '#667788',
    fontSize: 11,
    marginTop: 2,
  },
  childRemoveBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childRemoveBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },

  // ---- Actions ----
  actions: {
    gap: 10,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  scanChildBtn: {
    borderColor: '#22C55E33',
    backgroundColor: '#1A2332',
  },
  scanBtnIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  scanBtnText: {
    color: '#B0C4D8',
    fontSize: 15,
    fontWeight: '600',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  linkBtnIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  linkBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // ---- Popups (shared) ----
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupCard: {
    backgroundColor: '#1A2332',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  popupIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  popupTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  popupMessage: {
    color: '#B0C4D8',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  popupInfo: {
    width: '100%',
    backgroundColor: '#0F1923',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  popupLabel: {
    color: '#8899AA',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  popupValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  popupCapacity: {
    color: '#22C55E',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  popupCapacityFull: {
    color: '#EF4444',
  },
  popupWarning: {
    width: '100%',
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  popupWarningText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  popupOk: {
    width: '100%',
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  popupOkText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  popupActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  popupCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    alignItems: 'center',
  },
  popupCancelText: {
    color: '#8899AA',
    fontSize: 14,
    fontWeight: '600',
  },
  popupConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
  },
  popupConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

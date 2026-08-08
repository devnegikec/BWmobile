// ============================================================
// Inbound Screen — Full inbound receiving workflow
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useInboundStore } from '../store/inboundStore';
import QrScanner from '../components/QrScanner';
import * as inboundService from '../api/inboundService';
import * as qsealService from '../api/qsealService';
import type { SessionSummary, ReceivingSlip, AsnOrder, SummaryItem } from '../types';
import type { QSealParentWithUnits } from '../types';

type Step = 'idle' | 'scanning' | 'summary' | 'slip_generated';

// ---- Expandable Linked Units Table ----
function LinkedUnitsTable({ parents }: { parents: QSealParentWithUnits[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!parents || parents.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const boxCount = parents.length;
  const itemCount = parents.reduce((sum, p) => sum + (p.linked_units?.length || 0), 0);

  return (
    <View style={styles.tableContainer}>
      {/* Summary header */}
      <View style={styles.tableHeader}>
        <Text style={styles.tableHeaderText}>
          📦 {boxCount} box{boxCount > 1 ? 'es' : ''} · 📋 {itemCount} item{itemCount > 1 ? 's' : ''}
        </Text>
      </View>

      {/* Column headers */}
      <View style={styles.tableColHeaders}>
        <Text style={[styles.colHeader, styles.colProduct]}>Product</Text>
        <Text style={[styles.colHeader, styles.colSku]}>SKU</Text>
        <Text style={[styles.colHeader, styles.colBatch]}>Batch</Text>
        <Text style={[styles.colHeader, styles.colBox]}>Box</Text>
        <Text style={[styles.colHeader, styles.colQty]}>Qty</Text>
      </View>

      {/* Parent rows */}
      {parents.map((parent, pIdx) => {
        const isOpen = expanded.has(parent.id);
        const units = parent.linked_units || [];
        const firstUnit = units[0];
        return (
          <View key={parent.id}>
            <TouchableOpacity
              style={styles.parentRow}
              onPress={() => toggleExpand(parent.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.cell, styles.colProduct]} numberOfLines={1}>
                {isOpen ? '▼ ' : '▶ '}{firstUnit?.product_name || parent.name}
              </Text>
              <Text style={[styles.cell, styles.colSku]} numberOfLines={1}>
                {firstUnit?.product_sku || '-'}
              </Text>
              <Text style={[styles.cell, styles.colBatch]} numberOfLines={1}>
                {firstUnit?.dispatch_batch || '-'}
              </Text>
              <Text style={[styles.cell, styles.colBox]}>
                {pIdx + 1}/{boxCount}
              </Text>
              <Text style={[styles.cell, styles.colQty]}>
                {units.length}
              </Text>
            </TouchableOpacity>

            {/* Expanded: unit details */}
            {isOpen &&
              units.map((unit) => (
                <View key={unit.id} style={styles.unitRow}>
                  <Text style={[styles.cell, styles.colProduct]} numberOfLines={1}>
                    {'    '}└ {unit.serial_number}
                  </Text>
                  <Text style={[styles.cell, styles.colSku]}>
                    {unit.product_sku || '-'}
                  </Text>
                  <Text style={[styles.cell, styles.colBatch]}>
                    {unit.dispatch_batch || '-'}
                  </Text>
                  <Text style={[styles.cell, styles.colBox]}> </Text>
                  <Text style={[styles.cell, styles.colQty]}>1</Text>
                </View>
              ))}
          </View>
        );
      })}
    </View>
  );
}

export default function InboundScreen({ navigation }: any) {
  const { selectedWarehouse, user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';
  console.log('[Inbound] orgId sources:', {
    userOrgId: user?.organization_id,
    workerOrgId: worker?.organization_id,
    userKeys: user ? Object.keys(user) : 'null',
    workerKeys: worker ? Object.keys(worker) : 'null',
    final: orgId,
  });
  const {
    currentSession,
    sessionSummary,
    lastScan,
    generatedSlip,
    isScanning,
    isLoading,
    error,
    linkedUnitsParents,
    availableAsns,
    selectedAsn,
    isFetchingAsns,
    itemRejections,
    startSession,
    recordScan,
    clearLinkedUnits,
    loadSummary,
    endSession,
    clearSession,
    clearError,
    fetchAsnOrders,
    selectAsn,
    toggleItemRejection,
    rejectSlipItems,
  } = useInboundStore();

  const [step, setStep] = useState<Step>('idle');
  const [dockLocation, setDockLocation] = useState('');
  const [isProcessingQSeal, setIsProcessingQSeal] = useState(false);
  const [showAsnPicker, setShowAsnPicker] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');

  // Sync step with store state
  useEffect(() => {
    if (generatedSlip) {
      setStep('slip_generated');
    } else if (isScanning) {
      setStep('scanning');
    } else if (currentSession && !isScanning) {
      setStep('summary');
    } else {
      setStep('idle');
    }
  }, [currentSession, isScanning, generatedSlip]);

  // ============ HANDLERS ============

  const handleStartSession = async () => {
    if (!selectedWarehouse) {
      Alert.alert('Error', 'Please select a warehouse first.');
      return;
    }
    if (!dockLocation.trim()) {
      Alert.alert('Error', 'Please enter a dock location.');
      return;
    }
    try {
      clearLinkedUnits();
      await startSession(
        selectedWarehouse.id,
        dockLocation.trim(),
        selectedAsn?.id
      );
      setStep('scanning');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // ---- Extract serial from QSeal URL, or null if not a QSeal QR ----
  // Supports both URL patterns:
  //   Pattern A: /qseal/{SERIAL}        e.g. https://.../qseal/QSL5E248FC
  //   Pattern B: /s/{SERIAL}/{...}      e.g. https://.../g/SKU/s/JV9HKW/12345
  const extractQSealSerial = (qrData: string): string | null => {
    const trimmed = qrData.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
    try {
      const url = new URL(trimmed);
      const pathParts = url.pathname.split('/').filter(Boolean);

      // Pattern A: /qseal/{SERIAL}
      const qsealIdx = pathParts.indexOf('qseal');
      if (qsealIdx !== -1 && qsealIdx + 1 < pathParts.length) {
        return pathParts[qsealIdx + 1];
      }

      // Pattern B: /s/{SERIAL}/...
      const sIdx = pathParts.indexOf('s');
      if (sIdx !== -1 && sIdx + 1 < pathParts.length) {
        return pathParts[sIdx + 1];
      }
    } catch {}
    return null;
  };

  const handleScan = async (data: string) => {
    console.log('[Inbound] handleScan raw data:', data.substring(0, 120));
    const qsealSerial = extractQSealSerial(data);
    console.log('[Inbound] isQSeal:', !!qsealSerial, 'serial:', qsealSerial);

    if (qsealSerial) {
      // ---- QSeal parent QR: resolve → fetch linked units → record each ----
      await handleQSealScan(qsealSerial);
    } else {
      // ---- Regular item QR: record scan directly ----
      console.log('[Inbound] recordScan (regular):', { qr_data: data.substring(0, 80) });
      try {
        await recordScan(data);
        console.log('[Inbound] recordScan SUCCESS');
      } catch (err: any) {
        console.log('[Inbound] recordScan FAILED:', {
          status: err?.response?.status,
          data: JSON.stringify(err?.response?.data),
        });
        Alert.alert('Notice', err.message);
      }
    }
  };

  // ---- QSeal parent scan: Step 1→2→3 ----
  const handleQSealScan = async (serial: string) => {
    console.log('[Inbound] QSeal scan started, serial:', serial, 'orgId:', orgId);

    if (!orgId) {
      Alert.alert('Error', 'Organization ID not found. Please log out and log in again.');
      return;
    }

    setIsProcessingQSeal(true);
    try {
      // Step 1: Resolve serial → get parent UUID
      console.log('[Inbound] Step 1: POST /qseal/scan', { serial_number: serial, orgId });
      const node = await qsealService.scanQSeal(orgId, {
        serial_number: serial,
        device_type: 'mobile',
        os: 'iOS/Android',
        ip_address: '',
      });
      console.log('[Inbound] Step 1 OK: node_id:', node.node_id, 'type:', node.qseal_type);

      // Step 2: Fetch linked units (appends to the list)
      console.log('[Inbound] Step 2: GET /qseal/parents/', node.node_id, '/linked-units');
      const parentWithUnits = await qsealService.getLinkedUnits(node.node_id);
      console.log('[Inbound] Step 2 OK: linked_units count:', parentWithUnits.linked_units.length);
      // Add to store for display
      useInboundStore.setState((s) => ({
        linkedUnitsParents: [...s.linkedUnitsParents, parentWithUnits],
      }));

      // Step 3: Record each linked unit's product_item_url as a scan
      const units = parentWithUnits.linked_units || [];
      if (units.length > 0) {
        let scannedCount = 0;
        for (const unit of units) {
          const url = unit.product_item_url || unit.serial_number;
          console.log('[Inbound] Step 3: recordScan linked unit:', {
            serial: unit.serial_number,
            url: url?.substring(0, 80),
          });
          try {
            await recordScan(url);
            scannedCount++;
            console.log('[Inbound] Step 3 OK:', unit.serial_number);
          } catch (err: any) {
            console.log('[Inbound] Step 3 FAILED:', {
              serial: unit.serial_number,
              status: err?.response?.status,
              data: JSON.stringify(err?.response?.data),
            });
          }
        }
        console.log('[Inbound] Step 3 done:', scannedCount, '/', parentWithUnits.linked_units.length, 'recorded');
        const boxCount = useInboundStore.getState().linkedUnitsParents?.length || 0;
        if (scannedCount > 0) {
          Alert.alert(
            'QSeal Processed',
            `Box ${boxCount}: ${parentWithUnits.name}\n${scannedCount} item(s) recorded.`
          );
        }
      }
    } catch (err: any) {
      console.log('[Inbound] QSeal scan FAILED:', {
        status: err?.response?.status,
        data: JSON.stringify(err?.response?.data),
        message: err?.message,
      });
      const detail = err?.response?.data?.detail || err?.message || '';
      const msg = typeof detail === 'string' ? detail : (detail?.message || 'Failed to process QSeal.');
      Alert.alert('QSeal Error', msg);
    } finally {
      setIsProcessingQSeal(false);
    }
  };

  const handleViewSummary = async () => {
    try {
      await loadSummary();
      setStep('summary');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleEndSession = async () => {
    const rejectionCount = Object.values(itemRejections).filter((r) => r.rejected).length;
    const message =
      rejectionCount > 0
        ? `This will generate a receiving slip with ${rejectionCount} item(s) marked for rejection. Continue?`
        : 'This will generate a receiving slip. Continue?';

    Alert.alert('End Session', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        onPress: async () => {
          try {
            const slip = await endSession();
            // After slip is created, reject marked items
            if (Object.values(itemRejections).some((r) => r.rejected)) {
              await rejectSlipItems(slip.id);
            }
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleNewSession = () => {
    clearSession();
    clearLinkedUnits();
    setDockLocation('');
    setShowAsnPicker(false);
    setStep('idle');
  };

  // ============ RENDER: IDLE (No session) ============
  if (step === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Inbound Receiving</Text>
          <Text style={styles.headerSubtitle}>Start a new receiving session</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Warehouse</Text>
            <Text style={styles.readOnlyValue}>
              {selectedWarehouse?.name || 'No warehouse selected'}
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dock Location</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Dock-A-12"
              placeholderTextColor="#667788"
              value={dockLocation}
              onChangeText={setDockLocation}
            />
          </View>

          {/* ASN Selection (Optional) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>ASN Reference (Optional)</Text>
            {selectedAsn ? (
              <View style={styles.asnSelectedRow}>
                <View style={styles.asnSelectedInfo}>
                  <Text style={styles.asnSelectedNo}>{selectedAsn.asn_order_no}</Text>
                  <Text style={styles.asnSelectedStatus}>{selectedAsn.status}</Text>
                </View>
                <TouchableOpacity
                  style={styles.asnClearButton}
                  onPress={() => selectAsn(null)}
                >
                  <Text style={styles.asnClearText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.asnPickerButton}
                onPress={() => {
                  if (selectedWarehouse) {
                    fetchAsnOrders(selectedWarehouse.id);
                  }
                  setShowAsnPicker(true);
                }}
              >
                <Text style={styles.asnPickerButtonText}>
                  {isFetchingAsns ? 'Loading...' : 'Select ASN (tap to choose)'}
                </Text>
                <Text style={styles.asnPickerArrow}>▼</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleStartSession}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Session & Scan</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ASN Picker Modal */}
        <Modal
          visible={showAsnPicker}
          animationType="slide"
          transparent
          onRequestClose={() => setShowAsnPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select ASN</Text>
                <TouchableOpacity onPress={() => setShowAsnPicker(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {isFetchingAsns ? (
                <ActivityIndicator color="#1A73E8" style={{ padding: 40 }} />
              ) : availableAsns.length === 0 ? (
                <View style={styles.emptyAsnState}>
                  <Text style={styles.emptyAsnText}>No confirmed ASNs found</Text>
                  <Text style={styles.emptyAsnSubtext}>
                    You can still start a blind receipt without an ASN.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={availableAsns}
                  keyExtractor={(item) => item.id}
                  style={styles.asnList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.asnListItem,
                        selectedAsn?.id === item.id && styles.asnListItemSelected,
                      ]}
                      onPress={() => {
                        selectAsn(item);
                        setShowAsnPicker(false);
                      }}
                    >
                      <View style={styles.asnListItemInfo}>
                        <Text style={styles.asnListItemNo}>{item.asn_order_no}</Text>
                        <Text style={styles.asnListItemSrc}>
                          From: {item.from_warehouse?.name || 'N/A'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.asnStatusBadge,
                          {
                            backgroundColor:
                              item.status === 'confirmed'
                                ? '#3B82F6'
                                : item.status === 'partially_delivered'
                                ? '#F59E0B'
                                : '#6B7280',
                          },
                        ]}
                      >
                        <Text style={styles.asnStatusBadgeText}>
                          {item.status.replace('_', ' ')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}

              <TouchableOpacity
                style={[styles.secondaryButton, { marginTop: 12 }]}
                onPress={() => {
                  selectAsn(null);
                  setShowAsnPicker(false);
                }}
              >
                <Text style={styles.secondaryButtonText}>Clear Selection (Blind Receipt)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ============ RENDER: SCANNING ============
  if (step === 'scanning' && currentSession) {
    return (
      <View style={styles.container}>
        {/* Session info bar */}
        <View style={styles.sessionBar}>
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionLabel}>Session Active</Text>
            <Text style={styles.sessionDock}>{currentSession.dock_location}</Text>
            {currentSession.asn_order_no && (
              <Text style={styles.sessionAsn}>📋 {currentSession.asn_order_no}</Text>
            )}
          </View>
          <View style={styles.scanCount}>
            <Text style={styles.scanCountNum}>
              {currentSession.total_boxes_scanned}
            </Text>
            <Text style={styles.scanCountLabel}>boxes</Text>
          </View>
        </View>

        {/* QR Scanner */}
        <QrScanner
          onScan={handleScan}
          title="Scan Item QR Code"
          subtitle={`Dock: ${currentSession.dock_location}`}
        />

        {/* Last scan feedback */}
        {lastScan && (
          <View style={styles.lastScanToast}>
            <Text style={styles.lastScanText}>
              ✅ {lastScan.sku} · Qty: {lastScan.raw_quantity} · {lastScan.batch_number || 'No batch'}
            </Text>
          </View>
        )}

        {/* QSeal Linked Units — expandable table */}
        {isProcessingQSeal && (
          <View style={styles.linkedUnitsLoading}>
            <ActivityIndicator size="small" color="#1A73E8" />
            <Text style={styles.linkedUnitsLoadingText}>Fetching linked units...</Text>
          </View>
        )}
        {linkedUnitsParents?.length > 0 && (
          <LinkedUnitsTable parents={linkedUnitsParents} />
        )}

        {/* Action buttons */}
        <View style={styles.scanActions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleViewSummary}
          >
            <Text style={styles.secondaryButtonText}>View Summary</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endButton}
            onPress={handleEndSession}
          >
            <Text style={styles.endButtonText}>End Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============ RENDER: SUMMARY ============
  if (step === 'summary' && sessionSummary && currentSession) {
    const rejectedCount = Object.values(itemRejections).filter((r) => r.rejected).length;
    const totalItems = sessionSummary.items.length;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.summaryContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Session Summary</Text>
          <Text style={styles.headerSubtitle}>
            {sessionSummary.total_boxes} boxes · {sessionSummary.total_quantity} qty
          </Text>
          {currentSession.asn_order_no && (
            <Text style={styles.summaryAsnRef}>📋 Linked to {currentSession.asn_order_no}</Text>
          )}
        </View>

        {/* Rejection summary bar */}
        {rejectedCount > 0 && (
          <View style={styles.rejectionSummaryBar}>
            <Text style={styles.rejectionSummaryText}>
              ⚠️ {rejectedCount} of {totalItems} item(s) marked for rejection
            </Text>
          </View>
        )}

        {sessionSummary.items.map((item, idx) => {
          const itemKey = `${item.sku}||${item.batches[0]?.batch_number || ''}`;
          const rejection = itemRejections[itemKey];
          const isRejected = rejection?.rejected || false;

          return (
            <View
              key={idx}
              style={[
                styles.summaryCard,
                isRejected && styles.summaryCardRejected,
              ]}
            >
              <View style={styles.summaryItemHeader}>
                <View style={styles.summaryItemInfo}>
                  <Text style={[styles.summarySku, isRejected && styles.summarySkuRejected]}>
                    {item.sku}
                  </Text>
                  <Text style={styles.summaryDetail}>
                    {item.total_boxes} boxes · {item.total_quantity} total qty
                  </Text>
                </View>
                {/* Reject / Accept Toggle */}
                <TouchableOpacity
                  style={[
                    styles.rejectToggle,
                    isRejected ? styles.rejectToggleActive : styles.rejectToggleInactive,
                  ]}
                  onPress={() => {
                    const batchNumber = item.batches[0]?.batch_number || '';
                    if (!isRejected) {
                      // Prompt for reason
                      Alert.prompt
                        ? Alert.prompt(
                            'Reject Item',
                            `Reason for rejecting ${item.sku}:`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Reject',
                                onPress: (text?: string) =>
                                  toggleItemRejection(item.sku, batchNumber, true, text || 'Rejected during review'),
                              },
                            ],
                            'plain-text',
                            'Damaged / Wrong item / Excess'
                          )
                        : toggleItemRejection(item.sku, batchNumber, true, 'Rejected during review');
                  } else {
                    toggleItemRejection(item.sku, batchNumber, false);
                  }
                  }}
                >
                  <Text
                    style={[
                      styles.rejectToggleText,
                      isRejected && styles.rejectToggleTextActive,
                    ]}
                  >
                    {isRejected ? '✕ Rejected' : 'Reject'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Rejection reason display */}
              {isRejected && rejection?.reason && (
                <View style={styles.rejectionReasonRow}>
                  <Text style={styles.rejectionReasonLabel}>Reason: </Text>
                  <Text style={styles.rejectionReasonText}>{rejection.reason}</Text>
                </View>
              )}

              {item.batches.map((batch, bIdx) => (
                <View key={bIdx} style={styles.batchRow}>
                  <Text style={styles.batchBadge}>{batch.batch_number}</Text>
                  <Text style={styles.batchDetail}>
                    {batch.quantity} qty · {batch.box_count} boxes
                  </Text>
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.summaryActions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep('scanning')}
          >
            <Text style={styles.secondaryButtonText}>Resume Scanning</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endButton}
            onPress={handleEndSession}
          >
            <Text style={styles.endButtonText}>
              End & Generate Slip{rejectedCount > 0 ? ` (${rejectedCount} rejected)` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ============ RENDER: SLIP GENERATED ============
  if (step === 'slip_generated' && generatedSlip) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.resultContent}>
        <View style={styles.successBanner}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>Receiving Slip Created</Text>
          <Text style={styles.slipNumber}>{generatedSlip.slip_number}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{generatedSlip.status}</Text>
          </View>
        </View>

        {/* Slip Items */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>Items ({generatedSlip.items.length})</Text>
          {generatedSlip.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemSku}>{item.sku}</Text>
                <Text style={styles.itemBatch}>{item.batch_number}</Text>
              </View>
              <View style={styles.itemQty}>
                <Text style={styles.itemQtyText}>{item.quantity} × {item.box_count} boxes</Text>
              </View>
            </View>
          ))}
        </View>

        {/* QSeal Linked Units */}
        {linkedUnitsParents?.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>🔗 Linked Units</Text>
            <LinkedUnitsTable parents={linkedUnitsParents} />
          </View>
        )}

        {/* Info note */}
        <View style={styles.infoNote}>
          <Text style={styles.infoNoteText}>
            ℹ️ Items are in float mode. Use the{' '}
            <Text style={styles.infoNoteHighlight}>Assign Bin</Text> tab
            to map items to bin locations.
          </Text>
        </View>

        {/* New Session Button */}
        <TouchableOpacity style={styles.newSessionButton} onPress={handleNewSession}>
          <Text style={styles.newSessionText}>Start New Session</Text>
        </TouchableOpacity>
      </ScrollView>
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

  // Idle form
  formContainer: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#B0C4D8',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  readOnlyValue: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: '#1A2332',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  input: {
    backgroundColor: '#1A2332',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  primaryButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  // Session bar
  sessionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  sessionInfo: {},
  sessionLabel: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionDock: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  scanCount: {
    alignItems: 'center',
  },
  scanCountNum: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  scanCountLabel: {
    color: '#8899AA',
    fontSize: 12,
  },

  // Last scan toast
  lastScanToast: {
    position: 'absolute',
    top: 140,
    left: 20,
    right: 20,
    backgroundColor: '#1A3A2A',
    padding: 14,
    borderRadius: 10,
    zIndex: 10,
  },
  lastScanText: {
    color: '#4ADE80',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Scan actions
  scanActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#1A2332',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#B0C4D8',
    fontSize: 15,
    fontWeight: '600',
  },
  endButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Summary
  summaryContent: {
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  summarySku: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryDetail: {
    color: '#8899AA',
    fontSize: 13,
    marginTop: 4,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 12,
  },
  batchBadge: {
    color: '#1A73E8',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(26,115,232,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  batchDetail: {
    color: '#B0C4D8',
    fontSize: 13,
  },
  summaryActions: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
  },

  // Result (slip generated)
  resultContent: {
    paddingBottom: 40,
  },
  successBanner: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#1A2332',
    marginHorizontal: 24,
    marginTop: 24,
    borderRadius: 16,
  },
  successIcon: {
    fontSize: 48,
  },
  successText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  slipNumber: {
    color: '#1A73E8',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  statusBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 24,
    marginTop: 20,
  },
  sectionCardTitle: {
    color: '#8899AA',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  itemInfo: {},
  itemSku: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  itemBatch: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },
  itemQty: {},
  itemQtyText: {
    color: '#B0C4D8',
    fontSize: 14,
  },

  // Info note
  infoNote: {
    backgroundColor: 'rgba(26,115,232,0.1)',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(26,115,232,0.25)',
  },
  infoNoteText: {
    color: '#8899AA',
    fontSize: 13,
    lineHeight: 20,
  },
  infoNoteHighlight: {
    color: '#1A73E8',
    fontWeight: '600',
  },

  newSessionButton: {
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 20,
  },
  newSessionText: {
    color: '#8899AA',
    fontSize: 16,
  },

  // ---- Linked Units Table ----
  tableContainer: {
    backgroundColor: '#1A2332',
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    overflow: 'hidden',
    maxHeight: 220,
  },
  tableHeader: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  tableHeaderText: { color: '#4ADE80', fontSize: 12, fontWeight: '700' },
  tableColHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0F1923',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  colHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  colProduct: { flex: 3, minWidth: 0 },
  colSku: { flex: 2, minWidth: 0 },
  colBatch: { flex: 2, minWidth: 0 },
  colBox: { width: 40, textAlign: 'center' },
  colQty: { width: 30, textAlign: 'center' },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#0F1923',
    borderBottomWidth: 1,
    borderBottomColor: '#1A2332',
  },
  cell: { color: '#B0C4D8', fontSize: 12 },

  linkedUnitsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
  },
  linkedUnitsLoadingText: { color: '#8899AA', fontSize: 13 },

  // ---- ASN Picker ----
  asnPickerButton: {
    backgroundColor: '#1A2332',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  asnPickerButtonText: {
    color: '#8899AA',
    fontSize: 15,
  },
  asnPickerArrow: {
    color: '#667788',
    fontSize: 12,
  },
  asnSelectedRow: {
    backgroundColor: '#1A2332',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  asnSelectedInfo: {
    flex: 1,
  },
  asnSelectedNo: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  asnSelectedStatus: {
    color: '#3B82F6',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  asnClearButton: {
    padding: 8,
  },
  asnClearText: {
    color: '#EF4444',
    fontSize: 18,
    fontWeight: '700',
  },

  // ---- ASN Modal ----
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A2332',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalClose: {
    color: '#8899AA',
    fontSize: 22,
    padding: 4,
  },
  asnList: {
    maxHeight: 400,
  },
  asnListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  asnListItemSelected: {
    backgroundColor: 'rgba(26,115,232,0.1)',
  },
  asnListItemInfo: {
    flex: 1,
  },
  asnListItemNo: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  asnListItemSrc: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 3,
  },
  asnStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
  },
  asnStatusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  emptyAsnState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyAsnText: {
    color: '#8899AA',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyAsnSubtext: {
    color: '#667788',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },

  // ---- Session ASN reference ----
  sessionAsn: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  // ---- Summary ASN reference ----
  summaryAsnRef: {
    color: '#60A5FA',
    fontSize: 13,
    marginTop: 6,
  },

  // ---- Rejection Summary Bar ----
  rejectionSummaryBar: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  rejectionSummaryText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ---- Summary Item Header (with reject toggle) ----
  summaryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryItemInfo: {
    flex: 1,
  },
  summaryCardRejected: {
    borderColor: '#EF4444',
    borderWidth: 1,
    opacity: 0.85,
  },
  summarySkuRejected: {
    color: '#EF4444',
    textDecorationLine: 'line-through',
  },
  rejectToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 12,
  },
  rejectToggleInactive: {
    backgroundColor: '#2A3A4A',
  },
  rejectToggleActive: {
    backgroundColor: '#EF4444',
  },
  rejectToggleText: {
    color: '#B0C4D8',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectToggleTextActive: {
    color: '#fff',
  },
  rejectionReasonRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239,68,68,0.2)',
  },
  rejectionReasonLabel: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectionReasonText: {
    color: '#FCA5A5',
    fontSize: 12,
    flex: 1,
  },
});

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
  Modal,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useInboundStore } from '../store/inboundStore';
import QrScanner from '../components/QrScanner';
import * as inboundService from '../api/inboundService';
import * as putawayService from '../api/putawayService';
import type { SessionSummary, ReceivingSlip, PutAwayList } from '../types';

type Step = 'idle' | 'scanning' | 'summary' | 'slip_generated' | 'putaway_generated';

export default function InboundScreen({ navigation }: any) {
  const { selectedWarehouse } = useAuthStore();
  const {
    currentSession,
    sessionSummary,
    lastScan,
    generatedSlip,
    isScanning,
    isLoading,
    error,
    startSession,
    recordScan,
    loadSummary,
    endSession,
    clearSession,
    clearError,
  } = useInboundStore();

  const [step, setStep] = useState<Step>('idle');
  const [dockLocation, setDockLocation] = useState('');

  // Put-away generation state
  const [generatingPutaway, setGeneratingPutaway] = useState(false);
  const [generatedPutaway, setGeneratedPutaway] = useState<PutAwayList | null>(null);
  const [putawayError, setPutawayError] = useState<string | null>(null);

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
      setGeneratedPutaway(null);
      setPutawayError(null);
      await startSession(selectedWarehouse.id, dockLocation.trim());
      setStep('scanning');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleScan = async (data: string) => {
    try {
      await recordScan(data);
    } catch (err: any) {
      // Duplicate scan — just show a brief warning, don't block
      Alert.alert('Notice', err.message);
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
    Alert.alert(
      'End Session',
      'This will generate a receiving slip. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          onPress: async () => {
            try {
              await endSession();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const handleGeneratePutaway = async () => {
    if (!generatedSlip) return;
    setGeneratingPutaway(true);
    setPutawayError(null);
    try {
      const workerId = useAuthStore.getState().worker?.id;
      const putaway = await putawayService.generatePutAwayFromSlip(
        generatedSlip.id,
        workerId
      );
      setGeneratedPutaway(putaway);
      setStep('putaway_generated');
      // Also approve the receiving slip
      try {
        await inboundService.approveReceivingSlip(generatedSlip.id, workerId);
      } catch {
        // Approval may have happened already during put-away generation
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Failed to generate put-away.';
      setPutawayError(detail);
      Alert.alert('Error', detail);
    } finally {
      setGeneratingPutaway(false);
    }
  };

  const handleNewSession = () => {
    clearSession();
    setDockLocation('');
    setGeneratedPutaway(null);
    setPutawayError(null);
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
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.summaryContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Session Summary</Text>
          <Text style={styles.headerSubtitle}>
            {sessionSummary.total_boxes} boxes · {sessionSummary.total_quantity} qty
          </Text>
        </View>

        {sessionSummary.items.map((item, idx) => (
          <View key={idx} style={styles.summaryCard}>
            <Text style={styles.summarySku}>{item.sku}</Text>
            <Text style={styles.summaryDetail}>
              {item.total_boxes} boxes · {item.total_quantity} total qty
            </Text>
            {item.batches.map((batch, bIdx) => (
              <View key={bIdx} style={styles.batchRow}>
                <Text style={styles.batchBadge}>{batch.batch_number}</Text>
                <Text style={styles.batchDetail}>
                  {batch.quantity} qty · {batch.box_count} boxes
                </Text>
              </View>
            ))}
          </View>
        ))}

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
            <Text style={styles.endButtonText}>End & Generate Slip</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ============ RENDER: SLIP GENERATED / PUTAWAY GENERATED ============
  if ((step === 'slip_generated' || step === 'putaway_generated') && generatedSlip) {
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

        {/* Put-Away Section */}
        {step === 'slip_generated' && !generatedPutaway && (
          <View style={styles.putawaySection}>
            <Text style={styles.putawayTitle}>Create Put-Away List</Text>
            <Text style={styles.putawayDesc}>
              Generate a put-away list to assign stock to bin locations.
            </Text>
            {putawayError && (
              <Text style={styles.putawayError}>{putawayError}</Text>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, generatingPutaway && styles.buttonDisabled]}
              onPress={handleGeneratePutaway}
              disabled={generatingPutaway}
            >
              {generatingPutaway ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Generate Put-Away List</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Generated Put-Away */}
        {generatedPutaway && (
          <View style={styles.putawayResult}>
            <Text style={styles.putawayResultTitle}>Put-Away List Generated</Text>
            <Text style={styles.putawayListNo}>{generatedPutaway.put_away_list_no}</Text>
            <Text style={styles.putawayStatus}>Status: {generatedPutaway.status}</Text>

            {generatedPutaway.warnings.length > 0 && (
              <View style={styles.warningsBox}>
                {generatedPutaway.warnings.map((w, i) => (
                  <Text key={i} style={styles.warningText}>⚠️ {w}</Text>
                ))}
              </View>
            )}

            <Text style={styles.putawayItemCount}>
              {generatedPutaway.items.length} items assigned to bins
            </Text>

            <TouchableOpacity
              style={styles.goToPutawayButton}
              onPress={() => navigation.navigate('Putaway')}
            >
              <Text style={styles.goToPutawayText}>Go to Put-Away →</Text>
            </TouchableOpacity>
          </View>
        )}

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

  // Put-away section
  putawaySection: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 24,
    marginTop: 20,
  },
  putawayTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  putawayDesc: {
    color: '#8899AA',
    fontSize: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  putawayError: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
  },
  putawayResult: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#1A73E8',
  },
  putawayResultTitle: {
    color: '#4ADE80',
    fontSize: 16,
    fontWeight: '700',
  },
  putawayListNo: {
    color: '#1A73E8',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8,
  },
  putawayStatus: {
    color: '#B0C4D8',
    fontSize: 14,
    marginTop: 8,
  },
  warningsBox: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 13,
    marginBottom: 4,
  },
  putawayItemCount: {
    color: '#8899AA',
    fontSize: 14,
    marginTop: 12,
  },
  goToPutawayButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  goToPutawayText: {
    color: '#fff',
    fontSize: 16,
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
});

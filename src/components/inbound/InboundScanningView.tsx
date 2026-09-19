// ============================================================
// InboundScanningView — Full-screen QR scanning state
// ============================================================
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import QrScanner from '@/components/QrScanner';
import type { AsnReceivingSummary, InboundExceptionClassification, InboundExceptionDestination, InboundScanExceptionInput, InboundSession, ScanRecord } from '@/types';

const REASON_BY_CLASSIFICATION: Record<InboundExceptionClassification, string> = {
  short: 'SHORT_PHYSICAL',
  damaged: 'DAMAGED',
  excess: 'EXCESS',
  hold: 'HOLD',
  quarantine: 'QUARANTINE',
};

interface Props {
  session: InboundSession;
  lastScan: ScanRecord | null;
  isProcessingQSeal: boolean;
  qsealBoxCount: number;
  qsealItemCount: number;
  reconciliation: AsnReceivingSummary | null;
  isReconciliationLoading: boolean;
  onScan: (data: string) => void;
  onViewSummary: () => void;
  onEndSession: () => void;
  onCancel: () => void;
  onClassifyLastScan: (exception: Omit<InboundScanExceptionInput, 'serial_number'>) => void;
}

export default function InboundScanningView({
  session,
  lastScan,
  isProcessingQSeal,
  qsealBoxCount,
  qsealItemCount,
  reconciliation,
  isReconciliationLoading,
  onScan,
  onViewSummary,
  onEndSession,
  onCancel,
  onClassifyLastScan,
}: Props) {
  const [showException, setShowException] = useState(false);
  const [classification, setClassification] = useState<InboundExceptionClassification>('damaged');
  const [reasonCode, setReasonCode] = useState('DAMAGED');
  const [destination, setDestination] = useState<InboundExceptionDestination | undefined>();
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<{
    uri: string;
    name?: string | null;
    type?: string | null;
  } | null>(null);

  const chooseClassification = (value: InboundExceptionClassification) => {
    setClassification(value);
    setReasonCode(REASON_BY_CLASSIFICATION[value]);
    setDestination(undefined);
  };

  const chooseEvidence = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setEvidence({ uri: asset.uri, name: asset.fileName, type: asset.mimeType });
    }
  };

  const saveException = () => {
    if (!lastScan) return;
    const requiresDestination = ['damaged', 'excess', 'hold', 'quarantine'].includes(classification);
    if (requiresDestination && !destination) return;
    onClassifyLastScan({
      classification,
      reason_code: reasonCode,
      destination,
      note: note.trim() || undefined,
      evidence_uri: evidence?.uri,
      evidence_name: evidence?.name || undefined,
      evidence_type: evidence?.type || undefined,
    });
    setShowException(false);
    setNote('');
    setEvidence(null);
  };

  // Only surface exception information when the ASN actually has one.
  const exceptionCount =
    (reconciliation?.excess_total_qty ?? 0) +
    (reconciliation?.damaged_total_qty ?? 0) +
    (reconciliation?.hold_total_qty ?? 0) +
    (reconciliation?.rejected_total_qty ?? 0);
  const hasExceptions =
    !!reconciliation &&
    (reconciliation.reconciliation_status === 'exception' || exceptionCount > 0);

  return (
    <View style={styles.container}>
      {/* Session info bar */}
      <View style={styles.sessionBar}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionLabel}>Session Active</Text>
          {session.dock_location ? (
            <Text style={styles.sessionDock}>{session.dock_location}</Text>
          ) : null}
          {session.asn_order_no && (
            <Text style={styles.sessionAsn}>📋 {session.asn_order_no}</Text>
          )}
          {session.vehicle_no && (
            <Text style={styles.sessionVehicle}>🚚 {session.vehicle_no}</Text>
          )}
        </View>
        <View style={styles.scanCount}>
          <Text style={styles.scanCountNum}>{session.total_boxes_scanned}</Text>
          <Text style={styles.scanCountLabel}>boxes</Text>
        </View>
      </View>

      {/* ---- Camera stage ----
          Everything between the session header and the action buttons is one
          full-bleed camera preview. The status text is drawn as a transparent
          overlay on top of it so the operator can always see what the camera
          is pointing at. */}
      <View style={styles.cameraStage}>
        <QrScanner
          onScan={onScan}
          title="Scan Item QR Code"
          subtitle={session.dock_location ? `Dock: ${session.dock_location}` : undefined}
        />

        <View style={styles.stageOverlay} pointerEvents="box-none">
          {/* Top: scan counts, plus an exception alert only when one exists */}
          <View style={styles.stageTop} pointerEvents="none">
            {(qsealBoxCount > 0 || qsealItemCount > 0) && (
              <View style={styles.qsealCountBar}>
                <Text style={styles.qsealCountText}>
                  📦 {qsealBoxCount} box{qsealBoxCount > 1 ? 'es' : ''}
                  {' · '}
                  📋 {qsealItemCount} item{qsealItemCount > 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {hasExceptions && reconciliation && (
              <View style={[styles.reconciliationBar, styles.reconciliationException]}>
                <Text style={styles.reconciliationTitle}>⚠ Exception requires review</Text>
                <Text style={styles.reconciliationText}>
                  Short {reconciliation.short_total_qty} · Excess {reconciliation.excess_total_qty} · Damaged {reconciliation.damaged_total_qty} · Hold {reconciliation.hold_total_qty} · Rejected {reconciliation.rejected_total_qty}
                </Text>
              </View>
            )}
          </View>

          {/* Bottom: progress + last scan, stacked transparently over the preview */}
          <View style={styles.stageBottom}>
            {isProcessingQSeal && (
              <View style={styles.linkedUnitsLoading} pointerEvents="none">
                <ActivityIndicator size="small" color="#1A73E8" />
                <Text style={styles.linkedUnitsLoadingText}>Fetching linked units...</Text>
              </View>
            )}
            {lastScan && (
              <View style={styles.lastScanToast}>
                <Text style={styles.lastScanText}>
                  ✅ {lastScan.sku} · Qty: {lastScan.raw_quantity} · {lastScan.batch_number || 'No batch'}
                </Text>
                <TouchableOpacity style={styles.exceptionButton} onPress={() => setShowException(true)}>
                  <Text style={styles.exceptionButtonText}>Classify exception</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.scanActions}>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onViewSummary}>
            <Text style={styles.secondaryButtonText}>View Summary</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.endButton} onPress={onEndSession}>
            <Text style={styles.endButtonText}>End Session</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showException} transparent animationType="slide" onRequestClose={() => setShowException(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Classify scanned item</Text>
            <Text style={styles.modalSubtitle}>
              {lastScan?.sku} · {lastScan?.qr_identifier}
            </Text>
            <Text style={styles.fieldLabel}>Exception type</Text>
            <View style={styles.choiceRow}>
              {(['damaged', 'hold', 'quarantine', 'excess', 'short'] as InboundExceptionClassification[]).map((value) => (
                <TouchableOpacity key={value} onPress={() => chooseClassification(value)}
                  style={[styles.choice, classification === value && styles.choiceSelected]}>
                  <Text style={[styles.choiceText, classification === value && styles.choiceTextSelected]}>{value.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Reason code</Text>
            <TextInput value={reasonCode} onChangeText={setReasonCode} autoCapitalize="characters"
              style={styles.textInput} placeholder="Select or enter a configured reason code" placeholderTextColor="#667788" />
            {['damaged', 'excess', 'hold', 'quarantine'].includes(classification) && (
              <>
                <Text style={styles.fieldLabel}>Send to</Text>
                <View style={styles.choiceRow}>
                  {(['HOLD', 'QUARANTINE'] as InboundExceptionDestination[]).map((value) => (
                    <TouchableOpacity key={value} onPress={() => setDestination(value)}
                      style={[styles.choice, destination === value && styles.choiceSelected]}>
                      <Text style={[styles.choiceText, destination === value && styles.choiceTextSelected]}>{value}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {!destination && <Text style={styles.validationText}>Choose HOLD or QUARANTINE.</Text>}
              </>
            )}
            <TextInput value={note} onChangeText={setNote} multiline style={[styles.textInput, styles.noteInput]}
              placeholder="Optional note" placeholderTextColor="#667788" />
            <TouchableOpacity style={styles.evidenceButton} onPress={chooseEvidence}>
              <Text style={styles.evidenceButtonText}>{evidence ? '✓ Evidence selected' : 'Add photo / evidence (optional)'}</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowException(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, (!reasonCode || (['damaged', 'excess', 'hold', 'quarantine'].includes(classification) && !destination)) && styles.modalSaveDisabled]}
                disabled={!reasonCode || (['damaged', 'excess', 'hold', 'quarantine'].includes(classification) && !destination)} onPress={saveException}>
                <Text style={styles.modalSaveText}>Save classification</Text>
              </TouchableOpacity>
            </View>
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
  /** Full-bleed camera region between the session header and the action buttons */
  cameraStage: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  /**
   * Transparent layer carrying the status text over the camera preview. Kept
   * `box-none` so taps fall through to anything underneath.
   */
  stageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  /** Top stack: box/item counts and exception alert */
  stageTop: {
    paddingTop: 10,
    gap: 10,
  },
  /** Bottom stack: QSeal progress and last-scan feedback */
  stageBottom: {
    paddingBottom: 8,
  },
  sessionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  sessionInfo: {
    flex: 1,
  },
  backButton: {
    marginRight: 10,
    paddingHorizontal: 4,
  },
  backIcon: {
    color: '#B0C4D8',
    fontSize: 28,
    lineHeight: 28,
  },
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
  sessionAsn: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  sessionVehicle: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
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
  reconciliationBar: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  reconciliationException: {
    backgroundColor: 'rgba(74,53,18,0.55)',
    borderColor: 'rgba(138,98,26,0.75)',
  },
  reconciliationTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  reconciliationText: {
    color: '#E0E8F0',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  lastScanToast: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.45)',
    padding: 14,
    borderRadius: 10,
  },
  lastScanText: {
    color: '#4ADE80',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  exceptionButton: { alignSelf: 'center', marginTop: 8, backgroundColor: '#B45309', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  exceptionButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  scanActions: {
    padding: 16,
    gap: 12,
    backgroundColor: '#1A2332',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
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
  cancelButton: {
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '700',
  },
  linkedUnitsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
  },
  linkedUnitsLoadingText: {
    color: '#E0E8F0',
    fontSize: 13,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  qsealCountBar: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  qsealCountText: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  modalCard: { backgroundColor: '#1A2332', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  modalSubtitle: { color: '#B0C4D8', marginTop: 4, fontSize: 13 },
  fieldLabel: { color: '#B0C4D8', fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#3A4A5A', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  choiceSelected: { backgroundColor: '#1A73E8', borderColor: '#1A73E8' },
  choiceText: { color: '#B0C4D8', fontSize: 11, fontWeight: '700' },
  choiceTextSelected: { color: '#fff' },
  textInput: { color: '#fff', borderWidth: 1, borderColor: '#3A4A5A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  noteInput: { minHeight: 64, marginTop: 12, textAlignVertical: 'top' },
  validationText: { color: '#FBBF24', fontSize: 12, marginTop: 7 },
  evidenceButton: { borderWidth: 1, borderColor: '#3A4A5A', borderStyle: 'dashed', borderRadius: 8, padding: 12, marginTop: 12, alignItems: 'center' },
  evidenceButtonText: { color: '#60A5FA', fontSize: 13, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancel: { flex: 1, padding: 13, borderRadius: 8, alignItems: 'center', backgroundColor: '#2A3A4A' },
  modalCancelText: { color: '#B0C4D8', fontWeight: '700' },
  modalSave: { flex: 1.5, padding: 13, borderRadius: 8, alignItems: 'center', backgroundColor: '#1A73E8' },
  modalSaveDisabled: { opacity: 0.45 },
  modalSaveText: { color: '#fff', fontWeight: '700' },
});

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

      {session.asn_order_id && (
        <View style={[
          styles.reconciliationBar,
          reconciliation?.ready_for_receipt_note && styles.reconciliationReady,
          reconciliation?.reconciliation_status === 'exception' && styles.reconciliationException,
        ]}>
          {isReconciliationLoading && !reconciliation ? (
            <Text style={styles.reconciliationText}>Refreshing ASN reconciliation…</Text>
          ) : reconciliation ? (
            <>
              <Text style={styles.reconciliationTitle}>
                {reconciliation.ready_for_receipt_note
                  ? '✓ Reconciled — Ready for Receipt Note'
                  : reconciliation.reconciliation_status === 'exception'
                    ? '⚠ Exception requires review'
                    : reconciliation.is_partial_receipt
                      ? `Partial receipt · ${reconciliation.short_total_qty} units remaining`
                      : 'Scanning in progress'}
              </Text>
              <Text style={styles.reconciliationText}>
                Expected {reconciliation.expected_total_qty} · Scanned {reconciliation.scanned_total_qty} · Accepted {reconciliation.accepted_total_qty}
              </Text>
              <Text style={styles.reconciliationText}>
                Short {reconciliation.short_total_qty} · Excess {reconciliation.excess_total_qty} · Damaged {reconciliation.damaged_total_qty} · Hold {reconciliation.hold_total_qty} · Rejected {reconciliation.rejected_total_qty}
              </Text>
            </>
          ) : (
            <Text style={styles.reconciliationText}>Live reconciliation is unavailable. Continue scanning and try again.</Text>
          )}
        </View>
      )}

      {/* QR Scanner */}
      <QrScanner
        onScan={onScan}
        title="Scan Item QR Code"
        subtitle={session.dock_location ? `Dock: ${session.dock_location}` : undefined}
      />

      {/* Last scan feedback */}
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

      {/* QSeal count bar (compact) */}
      {isProcessingQSeal && (
        <View style={styles.linkedUnitsLoading}>
          <ActivityIndicator size="small" color="#1A73E8" />
          <Text style={styles.linkedUnitsLoadingText}>Fetching linked units...</Text>
        </View>
      )}
      {qsealBoxCount > 0 && (
        <View style={styles.qsealCountBar}>
          <Text style={styles.qsealCountText}>
            📦 {qsealBoxCount} box{qsealBoxCount > 1 ? 'es' : ''}
            {' · '}
            📋 {qsealItemCount} item{qsealItemCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.scanActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onViewSummary}>
          <Text style={styles.secondaryButtonText}>View Summary</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endButton} onPress={onEndSession}>
          <Text style={styles.endButtonText}>End Session</Text>
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
    backgroundColor: '#182838',
    borderWidth: 1,
    borderColor: '#2A4A62',
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  reconciliationReady: {
    backgroundColor: '#173D2B',
    borderColor: '#2D7A4A',
  },
  reconciliationException: {
    backgroundColor: '#4A3512',
    borderColor: '#8A621A',
  },
  reconciliationTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  reconciliationText: {
    color: '#B0C4D8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
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
  exceptionButton: { alignSelf: 'center', marginTop: 10, backgroundColor: '#B45309', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  exceptionButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  linkedUnitsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
  },
  linkedUnitsLoadingText: { color: '#8899AA', fontSize: 13 },
  qsealCountBar: {
    backgroundColor: '#1A2332',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  qsealCountText: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
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

// ============================================================
// ConditionSheet — Capture the condition of a returned unit (§3.4, §4.3)
// ============================================================
// Rules baked in here:
//   • Four large, glove-friendly buttons (≥ 48 dp), one tap for `good`.
//   • A non-good condition REQUIRES a reason code — the picker is loaded live
//     from `GET /inbound/exception-reasons`; nothing is hard-coded.
//   • The picker defaults to the registration's original reason but the unit is
//     never auto-classified — an explicit tap is always required (task 6.9).
//   • The destination is the server's, unless the operator taps an override chip.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type {
  ExceptionReason,
  ReturnCondition,
  ReturnDestination,
  ReturnSessionItem,
} from '@/types';

const CONDITIONS: { value: ReturnCondition; label: string; emoji: string; color: string }[] = [
  { value: 'good', label: 'Good', emoji: '✅', color: '#16A34A' },
  { value: 'damaged', label: 'Damaged', emoji: '💥', color: '#DC2626' },
  { value: 'hold', label: 'Hold', emoji: '✋', color: '#D97706' },
  { value: 'quarantine', label: 'Quarantine', emoji: '🚧', color: '#7C3AED' },
];

/**
 * Destination overrides the operator may choose — §3.4.
 * `DAMAGED` is deliberately excluded until §10 Q3 (deferred task D.3) confirms a
 * physical damaged lane exists; enabling it without that answer ships a chip
 * that routes stock nowhere.
 */
const ENABLE_DAMAGED_DESTINATION = false;

const DESTINATIONS: ReturnDestination[] = ENABLE_DAMAGED_DESTINATION
  ? ['HOLD', 'QUARANTINE', 'DAMAGED']
  : ['HOLD', 'QUARANTINE'];

export interface ConditionSubmit {
  condition: ReturnCondition;
  reasonCode?: string;
  note?: string;
  destination?: ReturnDestination;
  /** True when re-sending an already-classified unit to change its reason. */
  override?: boolean;
}

interface Props {
  visible: boolean;
  item: ReturnSessionItem | null;
  /** Already-classified reason, shown as the picker's default (task 6.9). */
  defaultReasonCode?: string | null;
  reasonCodes: ExceptionReason[];
  isFetchingReasons: boolean;
  isSubmitting: boolean;
  /** §5.2 — classification is never queued offline, so it is blocked here. */
  isOffline: boolean;
  /** Set when this sheet is re-opened to change an existing classification. */
  isOverride?: boolean;
  onLoadReasons: (condition: ReturnCondition) => void;
  onClose: () => void;
  onSubmit: (submit: ConditionSubmit) => void;
}

export default function ConditionSheet({
  visible,
  item,
  defaultReasonCode,
  reasonCodes,
  isFetchingReasons,
  isSubmitting,
  isOffline,
  isOverride = false,
  onLoadReasons,
  onClose,
  onSubmit,
}: Props) {
  const [condition, setCondition] = useState<ReturnCondition | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [destination, setDestination] = useState<ReturnDestination | undefined>();
  const [showReasonError, setShowReasonError] = useState(false);

  // Reset every time the sheet opens for a (new) unit so nothing leaks across
  // units — and pre-select the registration's original reason.
  useEffect(() => {
    if (!visible) return;
    setCondition(null);
    setReasonCode(defaultReasonCode ?? null);
    setNote('');
    setDestination(undefined);
    setShowReasonError(false);
  }, [visible, item?.id, defaultReasonCode]);

  // Load the live reason list the first time a non-good condition is chosen.
  useEffect(() => {
    if (condition && condition !== 'good') onLoadReasons(condition);
  }, [condition, onLoadReasons]);

  const selectedReasonLabel = useMemo(
    () => (reasonCode ? reasonLabelFor(reasonCodes, reasonCode) : null),
    [reasonCode, reasonCodes]
  );

  /**
   * The list already arrives filtered by the SERVER for this condition, so no
   * client-side narrowing is needed.
   */
  const isNonGood = condition !== null && condition !== 'good';

  const handleCondition = (value: ReturnCondition) => {
    // §5.2 — a stock-moving request is never queued offline. The sheet may have
    // been opened while the link was healthy, so re-check at tap time.
    if (isOffline) return;
    setShowReasonError(false);
    setCondition(value);
    if (value === 'good') {
      // One tap, no picker, no note (§4.3 / task 6.2).
      onSubmit({ condition: 'good', override: isOverride || undefined });
    }
  };

  const handleSave = () => {
    if (isOffline) return;
    if (!condition) {
      setShowReasonError(true);
      return;
    }
    if (isNonGood && !reasonCode) {
      // Blocked client-side — the request must never be sent (task 6.4).
      setShowReasonError(true);
      return;
    }
    onSubmit({
      condition,
      reasonCode: isNonGood ? reasonCode ?? undefined : undefined,
      note: note.trim() ? note.trim() : undefined,
      destination: isNonGood ? destination : undefined,
      override: isOverride || undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* ---- Header ---- */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {isOverride ? 'Change reason' : 'Condition'}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {item ? `${item.sku} · ${item.serial_number}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={isSubmitting}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {isOffline && (
              <Text style={styles.offlineHint}>Offline — reconnect to save a condition.</Text>
            )}

            {/* ---- Four large buttons ---- */}
            <View style={styles.conditionGrid}>
              {CONDITIONS.map((option) => {
                const active = condition === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.conditionBtn,
                      { borderColor: option.color },
                      active && { backgroundColor: option.color },
                    ]}
                    onPress={() => handleCondition(option.value)}
                    disabled={isSubmitting || isOffline}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${option.label}`}
                  >
                    <Text style={styles.conditionEmoji}>{option.emoji}</Text>
                    <Text style={[styles.conditionLabel, active && styles.conditionLabelActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ---- Non-good: reason picker (live) + note + destination ---- */}
            {isNonGood && (
              <>
                <Text style={styles.sectionLabel}>
                  Reason <Text style={styles.required}>*</Text>
                </Text>
                {isFetchingReasons ? (
                  <ActivityIndicator color="#1A73E8" style={{ marginVertical: 12 }} />
                ) : reasonCodes.length === 0 ? (
                  <Text style={styles.emptyReasons}>
                    No reasons available for this condition — check your connection.
                  </Text>
                ) : (
                  <View style={styles.chipWrap}>
                    {reasonCodes.map((reason) => {
                      const active = reasonCode === reason.code;
                      return (
                        <TouchableOpacity
                          key={reason.code}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => {
                            setReasonCode(reason.code);
                            setShowReasonError(false);
                          }}
                          disabled={isSubmitting}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {reason.name || reason.code}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {showReasonError && (
                  <Text style={styles.inlineError}>Select a reason before saving.</Text>
                )}

                <Text style={styles.sectionLabel}>Note (optional)</Text>
                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. Dent on the lid"
                  placeholderTextColor="#667788"
                  multiline
                  editable={!isSubmitting}
                />

                <Text style={styles.sectionLabel}>Destination override (optional)</Text>
                <View style={styles.chipWrap}>
                  {DESTINATIONS.map((value) => {
                    const active = destination === value;
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setDestination(active ? undefined : value)}
                        disabled={isSubmitting}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {value}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.helperText}>
                  Leave empty to use the destination the server picks.
                </Text>

                {selectedReasonLabel && (
                  <Text style={styles.defaultHint}>
                    Default reason: {selectedReasonLabel}
                  </Text>
                )}
              </>
            )}
          </ScrollView>

          {/* ---- Footer ---- */}
          {isNonGood && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, (isSubmitting || isOffline) && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={isSubmitting || isOffline}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>Save condition</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Resolve an operator-facing label for a reason code, falling back to the code. */
function reasonLabelFor(codes: ExceptionReason[], code: string): string {
  const match = codes.find((c) => c.code === code);
  return match?.name || code;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A2332',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8FA3B5', fontSize: 13, marginTop: 2 },
  closeBtn: { padding: 8 },
  closeIcon: { color: '#8FA3B5', fontSize: 20, fontWeight: '600' },
  body: { paddingHorizontal: 18, paddingBottom: 16 },
  conditionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  conditionBtn: {
    width: '48%',
    minHeight: 84,
    borderWidth: 2,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: '#101A24',
  },
  conditionEmoji: { fontSize: 26, marginBottom: 4 },
  conditionLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  conditionLabelActive: { color: '#FFFFFF' },
  sectionLabel: {
    color: '#8FA3B5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  required: { color: '#DC2626' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    backgroundColor: '#101A24',
  },
  chipActive: { backgroundColor: '#1A73E8', borderColor: '#1A73E8' },
  chipText: { color: '#C7D2DC', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  noteInput: {
    backgroundColor: '#101A24',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 12,
    color: '#FFFFFF',
    padding: 12,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  helperText: { color: '#667788', fontSize: 12, marginTop: 8 },
  defaultHint: { color: '#8FA3B5', fontSize: 12, marginTop: 12, fontStyle: 'italic' },
  inlineError: { color: '#F87171', fontSize: 13, marginTop: 8 },
  offlineHint: { color: '#FCD34D', fontSize: 13, marginBottom: 6 },
  emptyReasons: { color: '#8FA3B5', fontSize: 13, fontStyle: 'italic' },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 },
  saveBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

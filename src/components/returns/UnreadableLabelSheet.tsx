// ============================================================
// UnreadableLabelSheet — Report a label the device cannot read (§4.2)
// ============================================================
// Reuses the LIVE `POST /inbound/exceptions/unreadable-qr` endpoint.
//
// The operator READS `carton_reference` off the carton. There is deliberately
// no way to type or "fix" an identity anywhere in this sheet (doc §9) — the
// field is a printed reference, not a scannable code.
//
// No success state is shown until the server responds (§5.6).
// ============================================================
import React, { useEffect, useState } from 'react';
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

export interface UnreadableSubmit {
  carton_reference: string;
  sku?: string;
  batch_number?: string;
  quantity?: number;
  note?: string;
}

interface Props {
  visible: boolean;
  /** Prefilled from the last scan's SKU when one is available. */
  defaultSku?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: UnreadableSubmit) => void;
}

export default function UnreadableLabelSheet({
  visible,
  defaultSku,
  isSubmitting,
  onClose,
  onSubmit,
}: Props) {
  const [cartonReference, setCartonReference] = useState('');
  const [sku, setSku] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [showError, setShowError] = useState(false);

  // Clear the form each time the sheet opens so a previous carton's reference
  // can never be re-submitted by accident.
  useEffect(() => {
    if (!visible) return;
    setCartonReference('');
    setSku(defaultSku ?? '');
    setBatchNumber('');
    setQuantity('');
    setNote('');
    setShowError(false);
  }, [visible, defaultSku]);

  const handleSubmit = () => {
    if (!cartonReference.trim()) {
      setShowError(true);
      return;
    }
    const parsedQty = Number(quantity);
    onSubmit({
      carton_reference: cartonReference.trim(),
      sku: sku.trim() || undefined,
      batch_number: batchNumber.trim() || undefined,
      quantity: quantity.trim() && Number.isFinite(parsedQty) ? parsedQty : undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Report unreadable label</Text>
              <Text style={styles.subtitle}>
                The carton goes to HOLD and a supervisor is alerted.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={isSubmitting}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>
              Carton reference <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={cartonReference}
              onChangeText={(text) => {
                setCartonReference(text);
                setShowError(false);
              }}
              placeholder="Read the printed serial / batch / ASN line"
              placeholderTextColor="#667788"
              autoCapitalize="characters"
              editable={!isSubmitting}
            />
            {showError && (
              <Text style={styles.inlineError}>Enter what is printed on the carton.</Text>
            )}

            <Text style={styles.sectionLabel}>SKU (optional)</Text>
            <TextInput
              style={styles.input}
              value={sku}
              onChangeText={setSku}
              placeholder="e.g. TTK-COOK-897"
              placeholderTextColor="#667788"
              autoCapitalize="characters"
              editable={!isSubmitting}
            />

            <Text style={styles.sectionLabel}>Batch number (optional)</Text>
            <TextInput
              style={styles.input}
              value={batchNumber}
              onChangeText={setBatchNumber}
              placeholder="e.g. BT-SEP-19"
              placeholderTextColor="#667788"
              autoCapitalize="characters"
              editable={!isSubmitting}
            />

            <Text style={styles.sectionLabel}>Quantity (optional)</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="1"
              placeholderTextColor="#667788"
              keyboardType="number-pad"
              editable={!isSubmitting}
            />

            <Text style={styles.sectionLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Label torn"
              placeholderTextColor="#667788"
              multiline
              editable={!isSubmitting}
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, isSubmitting && styles.saveBtnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Report as unreadable</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
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
  subtitle: { color: '#8FA3B5', fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 8 },
  closeIcon: { color: '#8FA3B5', fontSize: 20, fontWeight: '600' },
  body: { paddingHorizontal: 18, paddingBottom: 16 },
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
  input: {
    backgroundColor: '#101A24',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 12,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  noteInput: { minHeight: 64, textAlignVertical: 'top' },
  inlineError: { color: '#F87171', fontSize: 13, marginTop: 8 },
  footer: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 },
  saveBtn: {
    backgroundColor: '#D97706',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

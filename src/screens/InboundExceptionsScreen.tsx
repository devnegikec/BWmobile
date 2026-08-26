// ============================================================
// Inbound Holds & Quarantine — manager disposition queue
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as inboundService from '../api/inboundService';
import type { InboundException } from '../types';

type Disposition = 'release_to_receiving' | 'move_to_hold' | 'move_to_quarantine' | 'return_to_sender' | 'dispose';

const ACTIONS: Array<{ value: Disposition; label: string }> = [
  { value: 'release_to_receiving', label: 'Release to Receiving' },
  { value: 'move_to_hold', label: 'Move to HOLD' },
  { value: 'move_to_quarantine', label: 'Move to QUARANTINE' },
  { value: 'return_to_sender', label: 'Return to sender' },
  { value: 'dispose', label: 'Dispose' },
];

export default function InboundExceptionsScreen() {
  const { selectedWarehouse } = useAuthStore();
  const [items, setItems] = useState<InboundException[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<InboundException | null>(null);
  const [action, setAction] = useState<Disposition>('release_to_receiving');
  const [note, setNote] = useState('');
  const [itemId, setItemId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!selectedWarehouse) return;
    setLoading(true);
    try {
      const data = await inboundService.getInboundExceptions({ warehouse_id: selectedWarehouse.id });
      setItems(data.filter((item) => item.destination === 'HOLD' || item.destination === 'QUARANTINE'));
    } catch (error: any) {
      console.error('Failed to load inbound exceptions:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouse]);

  useEffect(() => { load(); }, [load]);

  const openDecision = (exception: InboundException) => {
    setSelected(exception);
    setAction('release_to_receiving');
    setNote('');
    setItemId('');
  };

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await inboundService.disposeInboundException(selected.id, {
        action,
        note: note.trim() || undefined,
        item_id: itemId.trim() || undefined,
      });
      setSelected(null);
      await load();
      Alert.alert('Decision recorded', 'The exception audit trail and physical routing were updated.');
    } catch (error: any) {
      Alert.alert(
        'Decision not applied',
        error?.response?.data?.detail || error?.response?.data?.message ||
          'Only an authorized Warehouse Manager or higher role can dispose an exception.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HOLD & QUARANTINE</Text>
        <Text style={styles.subtitle}>{selectedWarehouse?.name || 'Select a warehouse'} · manager decision queue</Text>
      </View>
      {loading && !items.length ? <ActivityIndicator color="#1A73E8" style={styles.loader} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#1A73E8" />}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyText}>No held or quarantined inventory</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.sku}>{item.sku || item.qr_identifier || 'Unknown item'}</Text>
                <View style={[styles.destination, item.destination === 'QUARANTINE' && styles.quarantine]}><Text style={styles.destinationText}>{item.destination}</Text></View>
              </View>
              <Text style={styles.detail}>Reason: {item.reason_code} · Qty: {item.quantity}</Text>
              {item.note ? <Text style={styles.detail}>Note: {item.note}</Text> : null}
              <Text style={styles.detail}>Evidence: {item.evidence.length} file(s) · Status: {item.status.replace('_', ' ')}</Text>
              <TouchableOpacity style={styles.decideButton} onPress={() => openDecision(item)}>
                <Text style={styles.decideText}>Manager decision</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Disposition decision</Text>
            <Text style={styles.modalSubtitle}>{selected?.sku || selected?.qr_identifier}</Text>
            {ACTIONS.map((choice) => (
              <TouchableOpacity key={choice.value} onPress={() => setAction(choice.value)}
                style={[styles.actionChoice, action === choice.value && styles.actionChoiceSelected]}>
                <Text style={[styles.actionText, action === choice.value && styles.actionTextSelected]}>{choice.label}</Text>
              </TouchableOpacity>
            ))}
            {action === 'release_to_receiving' && (
              <TextInput value={itemId} onChangeText={setItemId} style={styles.input}
                placeholder="Corrected SKU item ID (only if required)" placeholderTextColor="#667788" />
            )}
            <TextInput value={note} onChangeText={setNote} multiline style={[styles.input, styles.note]}
              placeholder="Optional decision note" placeholderTextColor="#667788" />
            <Text style={styles.guard}>The server verifies the exception permission and Warehouse Manager-or-higher role before applying this decision.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancel} onPress={() => setSelected(null)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirm} disabled={submitting} onPress={submit}>{submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Confirm</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 18, backgroundColor: '#1A2332' },
  title: { color: '#fff', fontSize: 21, fontWeight: '800' },
  subtitle: { color: '#8899AA', marginTop: 4, fontSize: 13 },
  loader: { marginTop: 40 }, list: { padding: 16, paddingBottom: 40 },
  empty: { paddingTop: 100, alignItems: 'center' }, emptyIcon: { fontSize: 38, color: '#4ADE80' }, emptyText: { color: '#B0C4D8', marginTop: 10 },
  card: { backgroundColor: '#1A2332', borderRadius: 12, borderWidth: 1, borderColor: '#2A3A4A', padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }, sku: { color: '#fff', fontWeight: '700', fontSize: 16, flex: 1 },
  destination: { backgroundColor: '#B45309', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }, quarantine: { backgroundColor: '#7C3AED' }, destinationText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  detail: { color: '#B0C4D8', fontSize: 12, marginTop: 3 }, decideButton: { marginTop: 14, backgroundColor: '#1A73E8', borderRadius: 8, alignItems: 'center', paddingVertical: 10 }, decideText: { color: '#fff', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }, modal: { backgroundColor: '#1A2332', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800' }, modalSubtitle: { color: '#B0C4D8', marginTop: 4, marginBottom: 12 },
  actionChoice: { borderWidth: 1, borderColor: '#3A4A5A', borderRadius: 8, padding: 11, marginTop: 7 }, actionChoiceSelected: { backgroundColor: '#1A73E8', borderColor: '#1A73E8' }, actionText: { color: '#B0C4D8', fontWeight: '600' }, actionTextSelected: { color: '#fff' },
  input: { color: '#fff', borderWidth: 1, borderColor: '#3A4A5A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 }, note: { minHeight: 60, textAlignVertical: 'top' },
  guard: { color: '#FBBF24', fontSize: 11, lineHeight: 16, marginTop: 12 }, modalButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: { flex: 1, backgroundColor: '#2A3A4A', padding: 13, borderRadius: 8, alignItems: 'center' }, cancelText: { color: '#B0C4D8', fontWeight: '700' }, confirm: { flex: 1, backgroundColor: '#1A73E8', padding: 13, borderRadius: 8, alignItems: 'center' }, confirmText: { color: '#fff', fontWeight: '700' },
});

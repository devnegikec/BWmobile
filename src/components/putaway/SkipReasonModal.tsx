import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { styles } from './PutawayScreen.styles';
import type { PutAwayItem } from '@/types';

interface SkipReasonModalProps {
  visible: boolean;
  target: PutAwayItem | null;
  reason: string;
  onChangeReason: (text: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function SkipReasonModal({
  visible,
  target,
  reason,
  onChangeReason,
  onCancel,
  onConfirm,
}: SkipReasonModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Skip Item</Text>
          <Text style={styles.modalSubtitle}>
            {target ? `${target.item_name || target.sku} — ${target.bin_full_path || target.bin_location_code}` : ''}
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter reason (e.g., Bin full, Damaged)"
            placeholderTextColor="#667788"
            value={reason}
            onChangeText={onChangeReason}
            multiline
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelButton} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmButton} onPress={onConfirm}>
              <Text style={styles.modalConfirmText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================
// StartSessionView — Idle state: dock + ASN selection form
// ============================================================
import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import ScreenContainer from '../ScreenContainer';
import type { AsnOrder } from '../../types';

interface Props {
  warehouseName: string;
  dockLocation: string;
  onDockLocationChange: (value: string) => void;
  selectedAsn: AsnOrder | null;
  availableAsns: AsnOrder[];
  isFetchingAsns: boolean;
  isLoading: boolean;
  showAsnPicker: boolean;
  onOpenAsnPicker: () => void;
  onCloseAsnPicker: () => void;
  onSelectAsn: (asn: AsnOrder) => void;
  onClearAsn: () => void;
  onStartSession: () => void;
}

export default function StartSessionView({
  warehouseName,
  dockLocation,
  onDockLocationChange,
  selectedAsn,
  availableAsns,
  isFetchingAsns,
  isLoading,
  showAsnPicker,
  onOpenAsnPicker,
  onCloseAsnPicker,
  onSelectAsn,
  onClearAsn,
  onStartSession,
}: Props) {
  return (
    <ScreenContainer
      title="Inbound Receiving"
      subtitle="Start a new receiving session"
      scrollable
    >
      <View style={styles.formContainer}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Warehouse</Text>
          <Text style={styles.readOnlyValue}>
            {warehouseName || 'No warehouse selected'}
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Dock Location</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Dock-A-12"
            placeholderTextColor="#667788"
            value={dockLocation}
            onChangeText={onDockLocationChange}
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
              <TouchableOpacity style={styles.asnClearButton} onPress={onClearAsn}>
                <Text style={styles.asnClearText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.asnPickerButton} onPress={onOpenAsnPicker}>
              <Text style={styles.asnPickerButtonText}>
                {isFetchingAsns ? 'Loading...' : 'Select ASN (tap to choose)'}
              </Text>
              <Text style={styles.asnPickerArrow}>▼</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={onStartSession}
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
        onRequestClose={onCloseAsnPicker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select ASN</Text>
              <TouchableOpacity onPress={onCloseAsnPicker}>
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
                    onPress={() => onSelectAsn(item)}
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
              onPress={onClearAsn}
            >
              <Text style={styles.secondaryButtonText}>Clear Selection (Blind Receipt)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
});

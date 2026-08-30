import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { styles } from './PickScreen.styles';
import type { Worker } from '@/types';

interface AssignWorkerModalProps {
    visible: boolean;
    loading: boolean;
    workers: Worker[];
    onSelect: (worker: Worker) => void;
    onClose: () => void;
}

export default function AssignWorkerModal({ visible, loading, workers, onSelect, onClose }: AssignWorkerModalProps) {
    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Assign Worker</Text>
                    {loading ? (
                        <ActivityIndicator color="#1A73E8" />
                    ) : (
                        <ScrollView style={{ maxHeight: 320 }}>
                            {workers.map((w) => (
                                <TouchableOpacity key={w.id} style={styles.workerRow} onPress={() => onSelect(w)}>
                                    <Text style={styles.workerName}>{w.display_name || `${w.first_name} ${w.last_name}`}</Text>
                                    {w.employee_id ? <Text style={styles.workerMeta}>{w.employee_id}</Text> : null}
                                </TouchableOpacity>
                            ))}
                            {workers.length === 0 && <Text style={styles.emptyText}>No workers found</Text>}
                        </ScrollView>
                    )}
                    <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
                        <Text style={styles.modalCancelText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './PickScreen.styles';
import type { PickListSummary } from '@/types';

interface PickListCardProps {
    item: PickListSummary;
    onPress: () => void;
}

export default function PickListCard({ item, onPress }: PickListCardProps) {
    const picked = item.progress?.picked_qty ?? 0;
    const total = item.progress?.total_qty ?? 0;
    const progress = total > 0 ? picked / total : 0;
    return (
        <TouchableOpacity
            style={[styles.listCard, item.status === 'completed' && styles.listCardCompleted]}
            onPress={onPress}
        >
            <View style={styles.listCardHeader}>
                <Text style={styles.listNo}>{item.pick_list_no}</Text>
                <View style={[styles.listStatus, item.status === 'in_progress' ? styles.listStatusActive : styles.listStatusDraft]}>
                    <Text style={styles.listStatusText}>{item.status}</Text>
                </View>
            </View>
            <Text style={styles.listInvoice}>{item.invoice_reference || '—'}</Text>
            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={styles.listDetail}>{picked}/{total} units picked</Text>
        </TouchableOpacity>
    );
}

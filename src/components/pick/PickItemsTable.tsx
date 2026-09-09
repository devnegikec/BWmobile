import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './PickScreen.styles';
import type { PickSerialDetail } from '@/types';
import type { PickGroup } from './types';

interface PickItemsTableProps {
    groups: PickGroup[];
    expandedGroups: Set<string>;
    suggestedBins?: Record<string, string>;
    onToggleGroup: (key: string) => void;
}

export default function PickItemsTable({ groups, expandedGroups, suggestedBins, onToggleGroup }: PickItemsTableProps) {
    return (
        <>
            <View style={styles.tableHeaders}>
                <Text style={[styles.tableHeader, styles.colProduct]}>Product / SKU</Text>
                <Text style={[styles.tableHeader, styles.colBatch]}>Batch</Text>
                <Text style={[styles.tableHeader, styles.colQty]}>Qty</Text>
                <Text style={[styles.tableHeader, styles.colPicked]}>Picked</Text>
            </View>

            {groups.map((group) => {
                const expanded = expandedGroups.has(group.key);
                const groupQty = group.children.reduce((s, c) => s + (c.qty || 0), 0);
                const groupPicked = group.children.reduce((s, c) => s + (c.picked_qty || 0), 0);
                const batch = group.children.map((c) => c.batch_no).find((b) => !!b) ?? null;
                const bins = Array.from(new Set(
                    group.children.map((c) => c.bin_location_path || c.bin_location_id || '').filter(Boolean),
                ));
                const suggested = group.children[0]?.item_id
                    ? suggestedBins?.[group.children[0].item_id]
                    : undefined;
                const serialRows: { serial: PickSerialDetail; bin: string | null }[] = [];
                const seenSerials = new Set<string>();
                for (const c of group.children) {
                    const bin = c.bin_location_path || c.bin_location_id || null;
                    for (const s of c.serials ?? []) {
                        if (s.serial_number && !seenSerials.has(s.serial_number)) {
                            seenSerials.add(s.serial_number);
                            serialRows.push({ serial: s, bin });
                        }
                    }
                }
                return (
                    <View key={group.key}>
                        <TouchableOpacity style={styles.tableRow} activeOpacity={0.7} onPress={() => onToggleGroup(group.key)}>
                            <View style={[styles.tableCell, styles.colProduct]}>
                                <Text style={styles.tableName} numberOfLines={1}>
                                    {expanded ? '▼ ' : '▶ '}{group.name}
                                </Text>
                                <Text style={styles.tableSku} numberOfLines={1}>{group.sku}</Text>
                                {bins.length > 0 && (
                                    <Text style={styles.tableBin} numberOfLines={1}>
                                        📍 {bins[0]}{bins.length > 1 ? ` +${bins.length - 1}` : ''}
                                    </Text>
                                )}
                                {bins.length === 0 && suggested && (
                                    <Text style={styles.tableBin} numberOfLines={1}>
                                        📍 Suggested: {suggested}
                                    </Text>
                                )}
                            </View>
                            <View style={[styles.tableCell, styles.colBatch]}>
                                <Text style={styles.tableBatch} numberOfLines={1}>{batch || '—'}</Text>
                            </View>
                            <View style={[styles.tableCell, styles.colQty]}>
                                <Text style={styles.tableQty}>{groupQty}</Text>
                            </View>
                            <View style={[styles.tableCell, styles.colPicked]}>
                                <Text style={[styles.tableQty, groupPicked >= groupQty && { color: '#10B981' }]}>{groupPicked}</Text>
                            </View>
                        </TouchableOpacity>

                        {expanded && serialRows.map(({ serial: s, bin }, idx: number) => (
                            <View key={`${s.serial_number}-${idx}`} style={[styles.tableRow, styles.tableRowChild]}>
                                <View style={[styles.tableCell, styles.colProduct]}>
                                    <Text style={styles.serialText}>S.N: {s.serial_number}</Text>
                                </View>
                                <View style={[styles.tableCell, { flex: 1 }]}>
                                    <Text style={styles.serialMeta}>
                                        SKU: {s.sku ?? group.sku}
                                        {s.manufacturing_date ? `  Mfg: ${s.manufacturing_date.slice(0, 10)}` : ''}
                                        {s.expiry_date ? `  Exp: ${s.expiry_date.slice(0, 10)}` : ''}
                                    </Text>
                                    {bin && <Text style={styles.tableBin}>📍 Bin: {bin}</Text>}
                                </View>
                            </View>
                        ))}
                    </View>
                );
            })}
        </>
    );
}

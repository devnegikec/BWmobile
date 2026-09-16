// ============================================================
// WarehouseSelector — Tappable warehouse pill + picker modal
// Lets users with multiple warehouses switch context at the top
// of the screen. Hides itself (renders a static pill) when the
// user only has a single warehouse.
// ============================================================
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';

interface Props {
  /** Extra style applied to the pill container */
  style?: StyleProp<ViewStyle>;
}

export default function WarehouseSelector({ style }: Props) {
  const { warehouses, selectedWarehouse, selectWarehouse } = useAuthStore();
  const [open, setOpen] = useState(false);

  const name = selectedWarehouse?.name ?? 'Select warehouse';

  // Single warehouse — no switching possible, render a non-tappable pill.
  if (warehouses.length <= 1) {
    return (
      <View style={[styles.pill, style]}>
        <Text style={styles.pillIcon}>🏭</Text>
        <Text style={styles.pillText} numberOfLines={1}>
          {name}
        </Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Change warehouse"
      >
        <Text style={styles.pillIcon}>🏭</Text>
        <Text style={styles.pillText} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select Warehouse</Text>
            <FlatList
              data={warehouses}
              keyExtractor={(w) => w.id}
              renderItem={({ item }) => {
                const active = item.id === selectedWarehouse?.id;
                return (
                  <TouchableOpacity
                    style={[styles.option, active && styles.optionActive]}
                    activeOpacity={0.7}
                    onPress={() => {
                      selectWarehouse(item);
                      setOpen(false);
                    }}
                  >
                    <View style={styles.optionTextWrap}>
                      <Text
                        style={[styles.optionName, active && styles.optionNameActive]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {(item.code || item.city) && (
                        <Text style={styles.optionMeta}>
                          {[item.code, item.city].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    {active && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  pillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  chevron: {
    color: '#8899AA',
    fontSize: 12,
    marginLeft: 6,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1A2332',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    paddingVertical: 12,
    maxHeight: '70%',
  },
  sheetTitle: {
    color: '#8899AA',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,58,74,0.6)',
  },
  optionActive: {
    backgroundColor: 'rgba(26,115,232,0.14)',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  optionNameActive: {
    color: '#1A73E8',
  },
  optionMeta: {
    color: '#667788',
    fontSize: 12,
    marginTop: 2,
  },
  check: {
    color: '#1A73E8',
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 10,
  },
});

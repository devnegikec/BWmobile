// ============================================================
// Assign Bin Screen — Scan Bin QR + Item QR to assign items
// ============================================================
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import QrScanner from '../components/QrScanner';
import * as binService from '../api/binService';

type ScanPhase = 'idle' | 'scanning_bin' | 'scanning_item' | 'confirm' | 'success';

interface BinInfo {
  bin_location_id: string;
  bin_code: string;
}

interface ItemInfo {
  item_id: string;
  sku: string;
  name?: string;
  batch_number: string;
  quantity: number;
}

export default function AssignBinScreen() {
  const { selectedWarehouse } = useAuthStore();

  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [binInfo, setBinInfo] = useState<BinInfo | null>(null);
  const [itemInfo, setItemInfo] = useState<ItemInfo | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [lastAssigned, setLastAssigned] = useState<{
    binCode: string;
    sku: string;
    qty: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ============ QR Parsing ============

  const parseBinQR = (data: string): BinInfo | null => {
    try {
      const parsed = JSON.parse(data);
      const binId = parsed.bin_id || parsed.bin_location_id || parsed.id;
      const binCode = parsed.bin_code || parsed.code || parsed.location;
      if (binId && binCode) {
        return { bin_location_id: binId, bin_code: binCode };
      }
      // Fallback: treat raw string as bin code
      if (data.trim().length > 0 && !data.startsWith('{')) {
        return { bin_location_id: data.trim(), bin_code: data.trim() };
      }
      return null;
    } catch {
      // Treat raw string as bin code
      if (data.trim().length > 0) {
        return { bin_location_id: data.trim(), bin_code: data.trim() };
      }
      return null;
    }
  };

  const parseItemQR = (data: string): ItemInfo | null => {
    try {
      const parsed = JSON.parse(data);
      const itemId = parsed.item_id || parsed.id;
      const sku = parsed.sku || parsed.code || '';
      const batch = parsed.batch || parsed.batch_number || parsed.batch_no || '';
      const qty = parseFloat(parsed.qty || parsed.quantity || '1');
      if (sku) {
        return {
          item_id: itemId || '',
          sku,
          name: parsed.name || parsed.product_name || undefined,
          batch_number: batch,
          quantity: isNaN(qty) ? 1 : qty,
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  // ============ Handlers ============

  const handleBinScan = (data: string) => {
    const parsed = parseBinQR(data);
    if (!parsed) {
      Alert.alert('Invalid QR', 'Could not read bin info. Try again.');
      return;
    }
    setBinInfo(parsed);
    setError(null);
    setPhase('scanning_item');
  };

  const handleItemScan = async (data: string) => {
    const parsed = parseItemQR(data);
    if (!parsed || !parsed.sku) {
      Alert.alert('Invalid QR', 'Could not read item info. Try again.');
      return;
    }

    // If item_id is missing, try to look it up by SKU
    if (!parsed.item_id && selectedWarehouse) {
      const lookedUp = await binService.lookupItemBySku(parsed.sku, selectedWarehouse.id);
      if (lookedUp) {
        parsed.item_id = lookedUp.item_id;
        parsed.name = lookedUp.name;
      }
    }

    setItemInfo(parsed);
    setError(null);
    setPhase('confirm');
  };

  const handleConfirmAssign = async () => {
    if (!binInfo || !itemInfo || !selectedWarehouse) return;

    setIsAssigning(true);
    setError(null);
    try {
      await binService.addStockToBin({
        bin_location_id: binInfo.bin_location_id,
        item_id: itemInfo.item_id,
        quantity: itemInfo.quantity,
        batch_number: itemInfo.batch_number || undefined,
        warehouse_id: selectedWarehouse.id,
      });

      setLastAssigned({
        binCode: binInfo.bin_code,
        sku: itemInfo.sku,
        qty: itemInfo.quantity,
      });
      setPhase('success');
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'Failed to assign item to bin.';
      setError(detail);
      Alert.alert('Error', detail);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAssignAnother = () => {
    setBinInfo(null);
    setItemInfo(null);
    setLastAssigned(null);
    setError(null);
    setPhase('idle');
  };

  const handleCancel = () => {
    setBinInfo(null);
    setItemInfo(null);
    setError(null);
    setPhase('idle');
  };

  // ============ RENDER: Scanning Bin ============
  if (phase === 'scanning_bin') {
    return (
      <View style={styles.container}>
        <QrScanner
          onScan={handleBinScan}
          title="Scan Bin QR"
          subtitle="Scan the QR code on the bin/shelf"
        />
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============ RENDER: Scanning Item ============
  if (phase === 'scanning_item') {
    return (
      <View style={styles.container}>
        {/* Bin info bar */}
        {binInfo && (
          <View style={styles.selectedBar}>
            <Text style={styles.selectedLabel}>Bin</Text>
            <Text style={styles.selectedValue}>{binInfo.bin_code}</Text>
          </View>
        )}
        <QrScanner
          onScan={handleItemScan}
          title="Scan Item QR"
          subtitle={binInfo ? `Assigning to: ${binInfo.bin_code}` : 'Scan the item to assign'}
        />
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============ RENDER: Confirm ============
  if (phase === 'confirm' && binInfo && itemInfo) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.confirmContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Confirm Assignment</Text>
        </View>

        <View style={styles.confirmCard}>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>Bin</Text>
            <Text style={styles.confirmValue}>{binInfo.bin_code}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>Item</Text>
            <Text style={styles.confirmValue}>{itemInfo.sku}</Text>
          </View>
          {itemInfo.name && (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Name</Text>
              <Text style={styles.confirmValue}>{itemInfo.name}</Text>
            </View>
          )}
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>Batch</Text>
            <Text style={styles.confirmValue}>{itemInfo.batch_number || 'N/A'}</Text>
          </View>
          <View style={styles.confirmRow}>
            <Text style={styles.confirmLabel}>Quantity</Text>
            <Text style={styles.confirmValue}>{itemInfo.quantity}</Text>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.confirmActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, isAssigning && styles.buttonDisabled]}
            onPress={handleConfirmAssign}
            disabled={isAssigning}
          >
            {isAssigning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Confirm Assign</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ============ RENDER: Success ============
  if (phase === 'success' && lastAssigned) {
    return (
      <View style={styles.container}>
        <View style={styles.successContent}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Assigned!</Text>
          <View style={styles.successCard}>
            <Text style={styles.successDetail}>
              {lastAssigned.sku} × {lastAssigned.qty}
            </Text>
            <Text style={styles.successDetail}>→ Bin: {lastAssigned.binCode}</Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={handleAssignAnother}>
            <Text style={styles.primaryButtonText}>Assign Another</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============ RENDER: Idle ============
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Assign Bin</Text>
        <Text style={styles.headerSubtitle}>
          Scan a bin QR and an item QR to map them
        </Text>
      </View>

      <View style={styles.idleContent}>
        <View style={styles.instructionCard}>
          <Text style={styles.instructionStep}>1</Text>
          <Text style={styles.instructionText}>
            Scan the bin QR code first
          </Text>
        </View>
        <View style={styles.instructionCard}>
          <Text style={styles.instructionStep}>2</Text>
          <Text style={styles.instructionText}>
            Then scan the item QR code
          </Text>
        </View>
        <View style={styles.instructionCard}>
          <Text style={styles.instructionStep}>3</Text>
          <Text style={styles.instructionText}>
            Confirm the assignment
          </Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setPhase('scanning_bin')}
        >
          <Text style={styles.primaryButtonText}>Start — Scan Bin QR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============ STYLES ============

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#1A2332',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#8899AA',
    fontSize: 14,
    marginTop: 4,
  },

  // Idle
  idleContent: {
    padding: 24,
    gap: 16,
  },
  instructionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  instructionStep: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1A73E8',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32,
    overflow: 'hidden',
  },
  instructionText: {
    color: '#B0C4D8',
    fontSize: 15,
    flex: 1,
  },

  // Scanning bar
  selectedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 10,
  },
  selectedLabel: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Confirm
  confirmContent: {
    paddingBottom: 40,
  },
  confirmCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    margin: 24,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  confirmLabel: {
    color: '#8899AA',
    fontSize: 14,
  },
  confirmValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
  },

  // Success
  successContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  successIcon: {
    fontSize: 56,
  },
  successTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  successCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1A73E8',
    width: '100%',
    gap: 4,
  },
  successDetail: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Shared buttons
  primaryButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
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
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#B0C4D8',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#2A3A4A',
    paddingVertical: 14,
    alignItems: 'center',
    margin: 16,
    borderRadius: 10,
  },
  cancelText: {
    color: '#8899AA',
    fontSize: 15,
    fontWeight: '500',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 24,
  },
});

// ============================================================
// Returns Screen — Pick a return registration and open a session
// ============================================================
// §2: `GET /returns/registrations?status=ready&warehouse_id=…` → pick the
// return to receive, then `POST /returns/registrations/{id}/sessions`.
// One open session per registration — the server's 409 is handled by the flow
// hook, which resumes the existing session instead of creating a second one.
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import WarehouseSelector from '@/components/WarehouseSelector';
import { useAuthStore } from '@/store/authStore';
import { useReturnsFlow } from '@/hooks/useReturnsFlow';
import { useReturnPermissions } from '@/utils/permissions';
import type { ReturnRegistration } from '@/types';

export default function ReturnsScreen({ navigation }: any) {
  const { selectedWarehouse } = useAuthStore();
  // §6 — opening (and therefore receiving against) a registration needs
  // `return.receive`.
  const { canReceive } = useReturnPermissions();
  const {
    registrations,
    isLoading,
    error,
    dockLocation,
    setDockLocation,
    loadRegistrations,
    handleOpenSession,
    clearError,
    currentSession,
  } = useReturnsFlow();

  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    loadRegistrations();
    // Reload whenever the operator switches warehouse.
  }, [loadRegistrations, selectedWarehouse?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRegistrations();
    setRefreshing(false);
  };

  const confirmOpen = (registration: ReturnRegistration) => {
    if (!canReceive) {
      Alert.alert(
        'Not permitted',
        'Your account cannot open a return session. Ask a supervisor to receive this return.'
      );
      return;
    }
    Alert.alert(
      'Open return session',
      `${registration.registration_no}\nExpected ${registration.expected_qty} · already received ${registration.received_qty}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: async () => {
            setOpeningId(registration.id);
            // Only navigate once a session is actually live — a failed open
            // must not drop the operator on an empty receive screen.
            const opened = await handleOpenSession(registration);
            setOpeningId(null);
            if (opened) navigation.navigate('ReturnReceive');
          },
        },
      ]
    );
  };

  const renderRow = ({ item }: { item: ReturnRegistration }) => {
    const isOpening = openingId === item.id;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => confirmOpen(item)}
        disabled={isOpening}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{item.registration_no}</Text>
          <View style={styles.statusChip}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        {(item.party_name || item.warehouse_name) && (
          <Text style={styles.cardMeta} numberOfLines={1}>
            {[item.party_name, item.warehouse_name].filter(Boolean).join(' · ')}
          </Text>
        )}
        <View style={styles.cardCounts}>
          <Text style={styles.countText}>
            Expected <Text style={styles.countValue}>{item.expected_qty}</Text>
          </Text>
          <Text style={styles.countText}>
            Received <Text style={styles.countValue}>{item.received_qty}</Text>
          </Text>
        </View>
        {isOpening && <ActivityIndicator color="#1A73E8" style={{ marginTop: 10 }} />}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer
      title="Returns"
      subtitle={selectedWarehouse?.name}
      onBack={() => navigation.goBack()}
    >
      <View style={styles.root}>
        {/* ---- Warehouse + dock entry ---- */}
        <View style={styles.controls}>
          <WarehouseSelector />
          <Text style={styles.label}>Dock location</Text>
          <TextInput
            style={styles.input}
            value={dockLocation}
            onChangeText={setDockLocation}
            placeholder="e.g. DOCK-B"
            placeholderTextColor="#667788"
            autoCapitalize="characters"
          />
          <Text style={styles.helper}>
            Scans are captured against this dock. Leave blank for a blind receipt.
          </Text>
        </View>

        {/* ---- A session is already open ---- */}
        {currentSession && (
          <TouchableOpacity
            style={styles.resumeBanner}
            onPress={() => navigation.navigate('ReturnReceive')}
          >
            <Text style={styles.resumeText}>
              Session in progress — tap to resume
            </Text>
          </TouchableOpacity>
        )}

        {/* ---- Error banner ---- */}
        {!!error && (
          <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        )}

        {/* ---- Registration list ---- */}
        {isLoading && registrations.length === 0 ? (
          <ActivityIndicator color="#1A73E8" style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={registrations}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A73E8" />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No returns ready</Text>
                <Text style={styles.emptyBody}>
                  Nothing is waiting to be received at this warehouse.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1923' },
  controls: { paddingHorizontal: 16, paddingTop: 12 },
  label: {
    color: '#8FA3B5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#101A24',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 12,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  helper: { color: '#667788', fontSize: 12, marginTop: 8 },
  resumeBanner: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    padding: 14,
  },
  resumeText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#451A1A',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#1A2332',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  cardMeta: { color: '#8FA3B5', fontSize: 12, marginTop: 6 },
  statusChip: {
    backgroundColor: '#101A24',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { color: '#8FA3B5', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardCounts: { flexDirection: 'row', gap: 20, marginTop: 10 },
  countText: { color: '#8FA3B5', fontSize: 13 },
  countValue: { color: '#FFFFFF', fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 48, paddingHorizontal: 24 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  emptyBody: { color: '#8FA3B5', fontSize: 13, marginTop: 6, textAlign: 'center' },
});

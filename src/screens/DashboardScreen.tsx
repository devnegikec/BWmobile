// ============================================================
// Dashboard Screen — Main hub after login
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import type { Warehouse } from '../types';

export default function DashboardScreen({ navigation }: any) {
  const {
    user,
    worker,
    warehouses,
    selectedWarehouse,
    loadWarehouses,
    selectWarehouse,
    logout,
    error,
    clearError,
  } = useAuthStore();

  const [refreshing, setRefreshing] = useState(false);
  const displayName = user?.display_name || worker?.display_name || 'User';
  const isWorker = !!worker;

  useEffect(() => {
    loadWarehouses();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWarehouses();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A73E8" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome,</Text>
          <Text style={styles.name}>{displayName}</Text>
          {worker && (
            <Text style={styles.role}>
              {worker.role === 'warehouse_worker' ? 'Warehouse Worker' : worker.role}
              {' · '}{worker.employee_id}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Warehouse Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Warehouse</Text>
        {warehouses.length === 0 ? (
          <View>
            <Text style={styles.noData}>
              {error ? `Error: ${error}` : 'Loading warehouses...'}
            </Text>
            {error && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  clearError();
                  loadWarehouses();
                }}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {warehouses.map((wh: Warehouse) => (
              <TouchableOpacity
                key={wh.id}
                style={[
                  styles.warehouseChip,
                  selectedWarehouse?.id === wh.id && styles.warehouseChipActive,
                ]}
                onPress={() => selectWarehouse(wh)}
              >
                <Text
                  style={[
                    styles.warehouseChipText,
                    selectedWarehouse?.id === wh.id && styles.warehouseChipTextActive,
                  ]}
                >
                  {wh.name}
                </Text>
                <Text style={styles.warehouseChipCode}>{wh.code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {selectedWarehouse && (
          <Text style={styles.selectedInfo}>
            Active: {selectedWarehouse.name} ({selectedWarehouse.code})
          </Text>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Operations</Text>

        <View style={styles.grid}>
          {/* Inbound */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Inbound')}
          >
            <Text style={styles.cardIcon}>📥</Text>
            <Text style={styles.cardTitle}>Inbound</Text>
            <Text style={styles.cardDesc}>
              Start receiving, scan items, generate slips
            </Text>
          </TouchableOpacity>

          {/* Put-Away */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Putaway')}
          >
            <Text style={styles.cardIcon}>📍</Text>
            <Text style={styles.cardTitle}>Put-Away</Text>
            <Text style={styles.cardDesc}>
              Process put-away lists, assign stock to bins
            </Text>
          </TouchableOpacity>

          {/* Receiving Slips */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ReceivingSlips')}
          >
            <Text style={styles.cardIcon}>📋</Text>
            <Text style={styles.cardTitle}>Receiving Slips</Text>
            <Text style={styles.cardDesc}>
              View and manage receiving slips
            </Text>
          </TouchableOpacity>

          {/* Pick Lists (future) */}
          <TouchableOpacity
            style={[styles.card, styles.cardDisabled]}
            disabled
          >
            <Text style={styles.cardIcon}>📤</Text>
            <Text style={styles.cardTitle}>Pick Lists</Text>
            <Text style={styles.cardDesc}>
              Coming soon
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Session Info */}
      {selectedWarehouse && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Warehouse:</Text>
            <Text style={styles.infoValue}>{selectedWarehouse.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Location:</Text>
            <Text style={styles.infoValue}>{selectedWarehouse.city}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type:</Text>
            <Text style={styles.infoValue}>{selectedWarehouse.type}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  content: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: '#1A2332',
  },
  greeting: {
    color: '#8899AA',
    fontSize: 14,
  },
  name: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 2,
  },
  role: {
    color: '#1A73E8',
    fontSize: 13,
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitle: {
    color: '#8899AA',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  noData: {
    color: '#667788',
    fontSize: 14,
    fontStyle: 'italic',
  },
  retryButton: {
    marginTop: 10,
    backgroundColor: '#1A73E8',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  warehouseChip: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 10,
    minWidth: 140,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  warehouseChipActive: {
    backgroundColor: '#1A3A5C',
    borderColor: '#1A73E8',
  },
  warehouseChipText: {
    color: '#B0C4D8',
    fontSize: 15,
    fontWeight: '600',
  },
  warehouseChipTextActive: {
    color: '#fff',
  },
  warehouseChipCode: {
    color: '#667788',
    fontSize: 12,
    marginTop: 2,
  },
  selectedInfo: {
    color: '#1A73E8',
    fontSize: 12,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    backgroundColor: '#1A2332',
    borderRadius: 14,
    padding: 20,
    width: '47%',
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  cardDisabled: {
    opacity: 0.4,
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: 10,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardDesc: {
    color: '#8899AA',
    fontSize: 12,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2332',
  },
  infoLabel: {
    color: '#8899AA',
    fontSize: 14,
  },
  infoValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});

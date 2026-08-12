// ============================================================
// Direct Put-Away Screen — Thin wrapper around hook + components
// ============================================================
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useDirectPutaway } from '../hooks/useDirectPutaway';
import { ScanningView } from '../components/putaway/ScanningView';
import { AssignView } from '../components/putaway/AssignView';

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse, user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  const {
    step, setStep, rows, expandedBoxes, isProcessing, lastFeedback,
    errorMsg, setErrorMsg, binId, setBinId, isAssigning,
    boxCount, childCount, assignedCount, pendingCount,
    handleScan, assignRow, assignAll, toggleExpand, clearAll,
  } = useDirectPutaway(orgId);

  if (step === 'scanning') {
    return (
      <View style={styles.container}>
        <ScanningView
          warehouseName={selectedWarehouse?.name || ''}
          boxCount={boxCount}
          childCount={childCount}
          assignedCount={assignedCount}
          pendingCount={pendingCount}
          isProcessing={isProcessing}
          lastFeedback={lastFeedback}
          errorMsg={errorMsg}
          onScan={handleScan}
          onClearError={() => setErrorMsg(null)}
          onViewAssign={() => setStep('assign')}
          onClear={clearAll}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AssignView
        boxCount={boxCount}
        childCount={childCount}
        assignedCount={assignedCount}
        binId={binId}
        isAssigning={isAssigning}
        rows={rows}
        expandedBoxes={expandedBoxes}
        onBinChange={setBinId}
        onAssignAll={assignAll}
        onToggleExpand={toggleExpand}
        onAssignRow={assignRow}
        onBack={() => setStep('scanning')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
});

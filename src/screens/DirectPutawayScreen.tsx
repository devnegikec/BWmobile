// ============================================================
// Direct Put-Away Screen — Thin wrapper around hook + components
// ============================================================
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useDirectPutaway } from '@/hooks/useDirectPutaway';
import { ScanningView } from '@/components/putaway/ScanningView';
import { AssignTable } from '@/components/putaway/AssignTable';
import AssignView from '@/components/putaway/AssignView';

export default function DirectPutawayScreen({ navigation }: any) {
  const { selectedWarehouse, user, worker } = useAuthStore();
  const orgId = user?.organization_id || worker?.organization_id || '';

  const {
    step, setStep, rows, expandedBoxes, isProcessing, lastFeedback,
    errorMsg, setErrorMsg, isAssigning,
    boxCount, childCount, assignedCount, pendingCount,
    handleScan, assignRow, assignAll, toggleExpand, clearAll,
  } = useDirectPutaway(orgId, selectedWarehouse?.id || '');

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
          onBack={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AssignView
        title="Assign to Bin"
        isAssigning={isAssigning}
        doneCount={assignedCount}
        pendingCount={pendingCount}
        onAssignAll={assignAll}
        onScanQSeal={handleScan}
        onBack={() => setStep('scanning')}
      >
        {(ctx) => (
          <AssignTable
            rows={rows}
            expandedBoxes={expandedBoxes}
            onToggleExpand={toggleExpand}
            onAssign={(row) => assignRow(row, ctx.bin?.location_id || '')}
            onScanBin={(row) => {
              if (row.serial) ctx.openScanner();
            }}
          />
        )}
      </AssignView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F1923' },
});

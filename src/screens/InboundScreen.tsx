// ============================================================
// Inbound Screen — Thin wrapper: selects view based on flow step
// ============================================================
import React from 'react';
import { useInboundFlow } from '@/hooks/useInboundFlow';
import StartSessionView from '@/components/inbound/StartSessionView';
import InboundScanningView from '@/components/inbound/InboundScanningView';
import SummaryView from '@/components/inbound/SummaryView';
import SlipGeneratedView from '@/components/inbound/SlipGeneratedView';

export default function InboundScreen() {
  const flow = useInboundFlow();

  if (flow.step === 'idle') {
    return (
      <StartSessionView
        warehouseName={flow.selectedWarehouse?.name || ''}
        dockLocation={flow.dockLocation}
        onDockLocationChange={flow.setDockLocation}
        selectedAsn={flow.selectedAsn}
        availableAsns={flow.availableAsns}
        isFetchingAsns={flow.isFetchingAsns}
        isLoading={flow.isLoading}
        showAsnPicker={flow.showAsnPicker}
        onOpenAsnPicker={flow.openAsnPicker}
        onCloseAsnPicker={() => flow.setShowAsnPicker(false)}
        onSelectAsn={flow.selectAsn}
        onClearAsn={() => flow.selectAsn(null)}
        onStartSession={flow.handleStartSession}
      />
    );
  }

  if (flow.step === 'scanning' && flow.currentSession) {
    return (
      <InboundScanningView
        session={flow.currentSession}
        lastScan={flow.lastScan}
        isProcessingQSeal={flow.isProcessingQSeal}
        qsealBoxCount={flow.linkedUnitsParents.length}
        qsealItemCount={flow.linkedUnitsParents.reduce(
          (sum, p) => sum + (p.linked_units?.length || 0),
          0
        )}
        reconciliation={flow.reconciliation}
        isReconciliationLoading={flow.isReconciliationLoading}
        onScan={flow.handleScan}
        onViewSummary={flow.handleViewSummary}
        onEndSession={flow.handleEndSession}
        onCancel={flow.handleCancelSession}
        onClassifyLastScan={flow.classifyLastScan}
      />
    );
  }

  if (flow.step === 'summary' && flow.sessionSummary && flow.currentSession) {
    return (
      <SummaryView
        sessionSummary={flow.sessionSummary}
        session={flow.currentSession}
        linkedUnitsParents={flow.linkedUnitsParents}
        onResumeScanning={() => flow.setStep('scanning')}
        onEndSession={flow.handleEndSession}
      />
    );
  }

  if (flow.step === 'slip_generated' && flow.generatedSlip) {
    return (
      <SlipGeneratedView
        slip={flow.generatedSlip}
        linkedUnitsParents={flow.linkedUnitsParents}
        onNewSession={flow.handleNewSession}
      />
    );
  }

  return null;
}

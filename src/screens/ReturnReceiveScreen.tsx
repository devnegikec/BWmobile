// ============================================================
// Return Receive Screen — scan, classify, end (§3.3–§3.5, §4, §5)
// ============================================================
// Rendered states, in priority order:
//   1. `endResult`        → draft Return Receipt Note summary (§3.5)
//   2. no `currentSession`→ nothing to receive (session ended/abandoned)
//   3. otherwise          → the live scanning screen
//
// Offline rules (§5.2) are enforced by gating the two calls that move stock:
// classify and end. Scans stay enabled so a timed-out scan can be retried.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import QrScanner from '@/components/QrScanner';
import ConditionSheet, { type ConditionSubmit } from '@/components/returns/ConditionSheet';
import UnreadableLabelSheet, {
  type UnreadableSubmit,
} from '@/components/returns/UnreadableLabelSheet';
import { useReturnsFlow } from '@/hooks/useReturnsFlow';
import { useReturnPermissions } from '@/utils/permissions';
import type { ReturnSessionItem } from '@/types';

const CONDITION_META: Record<string, { label: string; color: string }> = {
  good: { label: 'Good', color: '#16A34A' },
  damaged: { label: 'Damaged', color: '#DC2626' },
  hold: { label: 'Hold', color: '#D97706' },
  quarantine: { label: 'Quarantine', color: '#7C3AED' },
};

export default function ReturnReceiveScreen({ navigation }: any) {
  const flow = useReturnsFlow();
  // §6 / task 10.5 — a missing code HIDES the action instead of showing a
  // control that would fail with a 403.
  const { canReceive, canClassify, canScan, canReportUnreadable } = useReturnPermissions();
  const {
    currentSession,
    pendingItems,
    scanNotice,
    endResult,
    lastScan,
    reasonCodes,
    registrationReasonCode,
    isFetchingReasons,
    isSubmitting,
    isScanning,
    isOnline,
    handleScan,
    handleClassify,
    handleBulkGood,
    handleEndSession,
    handleCancelSession,
    finishAndExit,
    handleReportUnreadable,
    loadReasonCodes,
    clearScanNotice,
  } = flow;

  const [sheetItem, setSheetItem] = useState<ReturnSessionItem | null>(null);
  const [isOverride, setIsOverride] = useState(false);
  const [showUnreadable, setShowUnreadable] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [endNote, setEndNote] = useState('');

  const offline = !isOnline;

  // §4.1 / task 5.12 — `next_action: report_unreadable` (or a RETURN_QR_INVALID
  // scan) offers the unreadable-label sheet rather than a dead end.
  useEffect(() => {
    if (scanNotice?.action === 'report_unreadable') setShowUnreadable(true);
  }, [scanNotice]);

  const classifiedCount = useMemo(
    () => (currentSession?.scanned_qty ?? 0) - pendingItems.length,
    [currentSession?.scanned_qty, pendingItems.length]
  );

  // ---------------------------------------------------------
  // 1. Session ended — receipt note summary (§3.5, task 4.7 / 8.3)
  // ---------------------------------------------------------
  if (endResult) {
    return (
      <ScreenContainer title="Return receipt note" subtitle={currentSession?.registration_no}>
        <ScrollView contentContainerStyle={styles.resultBody}>
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Note</Text>
            <Text style={styles.resultBig}>{endResult.receipt_note.note_no}</Text>
            <Text style={styles.resultStatus}>
              {endResult.receipt_note.status.toUpperCase()} · registration{' '}
              {endResult.registration_status}
            </Text>
          </View>

          {/* Counts come straight from the response — never recomputed (§8 task 8.3). */}
          <View style={styles.resultRow}>
            <ResultStat label="Expected" value={endResult.expected_qty} />
            <ResultStat label="Received" value={endResult.received_qty} />
            <ResultStat label="Short" value={endResult.short_qty} tone="#D97706" />
          </View>

          <Text style={styles.sectionLabel}>Conditions</Text>
          <View style={styles.conditionsCard}>
            {(Object.keys(endResult.conditions) as (keyof typeof endResult.conditions)[]).map(
              (key) => (
                <View key={String(key)} style={styles.conditionRow}>
                  <View style={[styles.dot, { backgroundColor: CONDITION_META[key]?.color ?? '#8FA3B5' }]} />
                  <Text style={styles.conditionName}>
                    {CONDITION_META[key]?.label ?? String(key)}
                  </Text>
                  <Text style={styles.conditionValue}>{endResult.conditions[key]}</Text>
                </View>
              )
            )}
          </View>

          <Text style={styles.nextStep}>{endResult.next}</Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={async () => {
              await finishAndExit();
              navigation.navigate('Returns');
            }}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ---------------------------------------------------------
  // 2. No live session — nothing to receive
  // ---------------------------------------------------------
  if (!currentSession) {
    return (
      <ScreenContainer title="Return receiving" onBack={() => navigation.goBack()}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No open return session</Text>
          <Text style={styles.emptyBody}>
            Pick a ready registration to start receiving.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Returns')}
          >
            <Text style={styles.primaryBtnText}>Back to returns</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // ---------------------------------------------------------
  // 3. Live scanning screen
  // ---------------------------------------------------------
  const confirmLeave = () => {
    Alert.alert(
      'Leave this session?',
      'Scans stay recorded on the server — you can resume from the Returns list.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', onPress: () => navigation.goBack() },
      ]
    );
  };

  const confirmEnd = () => {
    if (pendingItems.length > 0) {
      // Blocked client-side too — the server would return the same 409 (§3.5).
      Alert.alert(
        'Units still to classify',
        `${pendingItems.length} unit(s) need a condition before the note can be produced.`,
        [{ text: 'OK', onPress: () => setSheetItem(pendingItems[0]) }]
      );
      return;
    }
    setEndNote('');
    setShowEnd(true);
  };

  const confirmCancel = () => {
    Alert.alert(
      'Discard this session?',
      'The scanned units are not classified and no receipt note is produced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await handleCancelSession();
            navigation.navigate('Returns');
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer
      title="Return receiving"
      subtitle={currentSession.registration_no}
      onBack={confirmLeave}
      headerRight={
        <View style={styles.badge}>
          <Text style={styles.badgeNum}>{pendingItems.length}</Text>
          <Text style={styles.badgeLabel}>to classify</Text>
        </View>
      }
    >
      {/* ---- Scanner — needs `return.receive` + `wms.scan` (task 10.3) ---- */}
      {canReceive && canScan ? (
        <QrScanner
          onScan={handleScan}
          title="Scan returned unit or carton"
          subtitle="Identity must already be on the registration"
        />
      ) : (
        <View style={styles.noPermission}>
          <Text style={styles.noPermissionText}>
            Scanning is not available for this account — ask a supervisor.
          </Text>
        </View>
      )}
      {isScanning && (
        <View style={styles.processingBar}>
          <ActivityIndicator size="small" color="#1A73E8" />
          <Text style={styles.processingText}>Validating…</Text>
        </View>
      )}

      {/* ---- Counters ---- */}
      <View style={styles.counterRow}>
        <Counter label="Expected" value={currentSession.expected_qty} />
        <Counter label="Scanned" value={currentSession.scanned_qty} />
        <Counter label="Classified" value={Math.max(0, classifiedCount)} />
      </View>

      {/* ---- Offline gate for stock-moving calls (§5.2) ---- */}
      {offline && (
        <View style={styles.offlineBar}>
          <Text style={styles.offlineText}>
            Connect to continue — classification and ending a session move stock and cannot be
            queued.
          </Text>
        </View>
      )}

      {/* ---- Scan notice (§4.1 / §7 — always the server hint) ---- */}
      {!!scanNotice && (
        <TouchableOpacity
          style={[
            styles.notice,
            scanNotice.tone === 'success' && styles.noticeSuccess,
            scanNotice.tone === 'warning' && styles.noticeWarning,
            scanNotice.tone === 'error' && styles.noticeError,
          ]}
          onPress={clearScanNotice}
        >
          <Text style={styles.noticeText}>{scanNotice.message}</Text>
          <Text style={styles.noticeDismiss}>✕</Text>
        </TouchableOpacity>
      )}

      {/* ---- Pending queue — the unit tap is the classification entry point ---- */}
      <FlatList
        data={flow.items}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const meta = item.condition ? CONDITION_META[item.condition] : null;
          const highlighted = scanNotice?.itemId === item.id;
          return (
            <TouchableOpacity
              style={[styles.itemRow, highlighted && styles.itemRowHighlight]}
              disabled={offline || !canClassify}
              onPress={() => {
                setIsOverride(item.condition !== null);
                setSheetItem(item);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemSku}>{item.sku}</Text>
                <Text style={styles.itemSerial}>{item.serial_number}</Text>
              </View>
              <View
                style={[
                  styles.conditionPill,
                  { borderColor: meta?.color ?? '#D97706' },
                  meta && { backgroundColor: meta.color },
                ]}
              >
                <Text style={[styles.conditionPillText, meta && { color: '#FFFFFF' }]}>
                  {meta ? meta.label : 'Classify'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyList}>Scan a unit to begin.</Text>
        }
      />

      {/* ---- Footer actions ---- */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            (offline || !canClassify || pendingItems.length === 0) && styles.btnDisabled,
          ]}
          disabled={offline || !canClassify || pendingItems.length === 0}
          onPress={() => handleBulkGood(pendingItems)}
        >
          <Text style={styles.secondaryBtnText}>
            All good{pendingItems.length > 0 ? ` (${pendingItems.length})` : ''}
          </Text>
        </TouchableOpacity>

        {canReportUnreadable && (
          <TouchableOpacity
            style={[styles.secondaryBtn, offline && styles.btnDisabled]}
            disabled={offline}
            onPress={() => setShowUnreadable(true)}
          >
            <Text style={styles.secondaryBtnText}>Unreadable label</Text>
          </TouchableOpacity>
        )}
      </View>

      {canReceive && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.dangerBtn} onPress={confirmCancel}>
            <Text style={styles.dangerBtnText}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, (offline || isSubmitting) && styles.btnDisabled]}
            disabled={offline || isSubmitting}
            onPress={confirmEnd}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>End session</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ---- Condition capture (§4.3) ---- */}
      <ConditionSheet
        visible={sheetItem !== null}
        item={sheetItem}
        // §4.3 task 6.9 — an already-classified unit shows its own reason when
        // overriding; otherwise fall back to the registration's original reason.
        defaultReasonCode={sheetItem?.reason_code ?? registrationReasonCode}
        reasonCodes={reasonCodes}
        isFetchingReasons={isFetchingReasons}
        isSubmitting={isSubmitting}
        isOverride={isOverride}
        onLoadReasons={loadReasonCodes}
        onClose={() => setSheetItem(null)}
        onSubmit={async (submit: ConditionSubmit) => {
          if (!sheetItem) return;
          await handleClassify(sheetItem, submit.condition, {
            reasonCode: submit.reasonCode,
            note: submit.note,
            destination: submit.destination,
            override: submit.override,
          });
          setSheetItem(null);
        }}
      />

      {/* ---- Unreadable label (§4.2) ---- */}
      <UnreadableLabelSheet
        visible={showUnreadable}
        defaultSku={lastScan?.sku}
        isSubmitting={isSubmitting}
        onClose={() => setShowUnreadable(false)}
        onSubmit={async (payload: UnreadableSubmit) => {
          // No success state is shown until the server responds (§5.6) — the
          // sheet closes only after `handleReportUnreadable` resolves.
          const result = await handleReportUnreadable(payload);
          if (result || !isOnline) setShowUnreadable(false);
        }}
      />

      {/* ---- End-session confirm (§3.5) ---- */}
      <Modal
        visible={showEnd}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEnd(false)}
      >
        <View style={styles.endBackdrop}>
          <View style={styles.endCard}>
            <Text style={styles.endTitle}>End return session</Text>
            <Text style={styles.endBody}>
              This produces a draft Return Receipt Note for supervisor review.
            </Text>
            <TextInput
              style={styles.endNote}
              value={endNote}
              onChangeText={setEndNote}
              placeholder="Note (optional)"
              placeholderTextColor="#667788"
              multiline
            />
            <View style={styles.endActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setShowEnd(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, isSubmitting && styles.btnDisabled]}
                disabled={isSubmitting}
                onPress={async () => {
                  setShowEnd(false);
                  await handleEndSession(endNote);
                }}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>End session</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ---------- Small presentational helpers ----------

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

function ResultStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={styles.resultStat}>
      <Text style={[styles.resultStatValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.resultStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', paddingHorizontal: 8 },
  badgeNum: { color: '#D97706', fontSize: 20, fontWeight: '800' },
  badgeLabel: { color: '#8FA3B5', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  processingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  processingText: { color: '#8FA3B5', fontSize: 13 },
  counterRow: {
    flexDirection: 'row',
    backgroundColor: '#1A2332',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2A3A4A',
  },
  counter: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  counterValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  counterLabel: {
    color: '#8FA3B5',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  offlineBar: {
    backgroundColor: '#3B2F14',
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineText: { color: '#FCD34D', fontSize: 12 },
  noPermission: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: '#101A24',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  noPermissionText: { color: '#8FA3B5', fontSize: 13, textAlign: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 4,
  },
  noticeSuccess: { backgroundColor: '#0F2A1B', borderLeftColor: '#16A34A' },
  noticeWarning: { backgroundColor: '#3B2F14', borderLeftColor: '#D97706' },
  noticeError: { backgroundColor: '#451A1A', borderLeftColor: '#DC2626' },
  noticeText: { color: '#FFFFFF', fontSize: 13, flex: 1 },
  noticeDismiss: { color: '#8FA3B5', fontSize: 16, paddingHorizontal: 8 },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  itemRowHighlight: { borderColor: '#D97706', borderWidth: 2 },
  itemSku: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  itemSerial: { color: '#8FA3B5', fontSize: 12, marginTop: 2 },
  conditionPill: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 10,
  },
  conditionPillText: { color: '#D97706', fontSize: 12, fontWeight: '700' },
  emptyList: { color: '#667788', textAlign: 'center', marginTop: 24, fontSize: 13 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#C7D2DC', fontSize: 14, fontWeight: '700' },
  dangerBtn: {
    flex: 1,
    backgroundColor: '#451A1A',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: '#FCA5A5', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  emptyTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  emptyBody: { color: '#8FA3B5', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  sectionLabel: {
    color: '#8FA3B5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  resultBody: { padding: 16 },
  resultCard: {
    backgroundColor: '#1A2332',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  resultLabel: { color: '#8FA3B5', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  resultBig: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 6 },
  resultStatus: { color: '#8FA3B5', fontSize: 12, marginTop: 6 },
  resultRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  resultStat: {
    flex: 1,
    backgroundColor: '#1A2332',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  resultStatValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  resultStatLabel: { color: '#8FA3B5', fontSize: 11, marginTop: 2, textTransform: 'uppercase' },
  conditionsCard: {
    backgroundColor: '#1A2332',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  conditionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  conditionName: { color: '#C7D2DC', fontSize: 14, flex: 1 },
  conditionValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  nextStep: { color: '#8FA3B5', fontSize: 13, marginTop: 16, fontStyle: 'italic' },
  endBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  endCard: {
    width: '100%',
    backgroundColor: '#1A2332',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  endTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  endBody: { color: '#8FA3B5', fontSize: 13, marginTop: 6 },
  endNote: {
    backgroundColor: '#101A24',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 12,
    color: '#FFFFFF',
    padding: 12,
    minHeight: 64,
    textAlignVertical: 'top',
    marginTop: 14,
  },
  endActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
});

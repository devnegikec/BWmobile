// ============================================================
// QsealCascadeScreen.styles — shared styles for the QSeal cascade screen
// ============================================================
import { StyleSheet, Platform } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },

  // ---- Header ----
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A2332',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
    paddingTop: 55,
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4, minWidth: 50 },
  backBtnText: { color: '#1A73E8', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // ---- Idle ----
  idleContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  idleIcon: { fontSize: 56, marginBottom: 16 },
  idleTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 12 },
  idleSubtitle: {
    color: '#8899AA',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  idleScanBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
  },
  idleScanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  doneBtn: { backgroundColor: '#1A2332', borderWidth: 1, borderColor: '#2A3A4A', marginTop: 12 },

  // ---- Scanning ----
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 55,
    backgroundColor: '#1A2332',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  statusLeft: { flex: 1 },
  statusLabel: { color: '#8899AA', fontSize: 13, fontWeight: '600' },
  statusParentSerial: {
    color: '#1A73E8',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  statusRight: { alignItems: 'center' },
  statusCount: { color: '#fff', fontSize: 24, fontWeight: '800' },
  statusCountLabel: { color: '#667788', fontSize: 10, fontWeight: '600' },

  scanToast: {
    position: 'absolute',
    top: 55 + 52,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(34,197,94,0.9)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  scanToastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  scanToastLoading: { backgroundColor: 'rgba(26,115,232,0.9)' },
  scanToastRow: { flexDirection: 'row', alignItems: 'center' },

  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 20,
    gap: 12,
    backgroundColor: '#1A2332',
    borderTopWidth: 1,
    borderTopColor: '#2A3A4A',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#8899AA', fontSize: 14, fontWeight: '600' },
  primaryButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.4 },

  // ---- Review ----
  content: { flex: 1 },
  reviewContent: { padding: 16, paddingBottom: 40 },
  reviewCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  reviewSectionTitle: {
    color: '#8899AA',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  reviewLabel: { color: '#667788', fontSize: 13 },
  reviewValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  reviewValueMono: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  emptyText: { color: '#667788', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  itemInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  itemIndex: { color: '#1A73E8', fontSize: 13, fontWeight: '700', width: 32 },
  itemSerial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },

  // ---- Review Actions ----
  linkCompleteBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  linkCompleteBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addMoreBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  addMoreBtnText: { color: '#1A73E8', fontSize: 14, fontWeight: '600' },

  // ---- Submitting ----
  submittingText: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 20 },
  submittingDetail: { color: '#667788', fontSize: 13, marginTop: 8, textAlign: 'center' },

  // ---- Success ----
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 10 },
  successMessage: { color: '#B0C4D8', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
});

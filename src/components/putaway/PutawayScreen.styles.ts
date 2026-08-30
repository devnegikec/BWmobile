// ============================================================
// PutawayScreen.styles — shared styles for the put-away screen
// ============================================================
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // Container + header (AssignView style)
  container: { flex: 1, backgroundColor: '#0F1923' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
  },
  backBtn: { padding: 6 },
  backIcon: { color: '#fff', fontSize: 28, lineHeight: 30 },
  headerSpacer: { width: 36 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#fff', textAlign: 'center' },
  headerSubtitle: { fontSize: 12, color: '#8899AA', marginTop: 2, textAlign: 'center' },

  // Table (AssignView-style)
  tableContent: { paddingHorizontal: 16, paddingBottom: 24 },
  tableHeaders: {
    flexDirection: 'row',
    backgroundColor: '#0F1923',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  tableHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  colProduct: { flex: 5, minWidth: 0 },
  colBatch: { flex: 2, minWidth: 0 },
  colQty: { width: 44, alignItems: 'center' as const },
  colAction: { width: 116, alignItems: 'flex-end' as const },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  tableRowDone: { opacity: 0.55, borderColor: '#10B981' },
  tableRowSkipped: { opacity: 0.55, borderColor: '#EF4444' },
  tableCell: { justifyContent: 'center' },
  tableRoute: { color: '#1A73E8', fontSize: 10, fontWeight: '700', marginRight: 4 },
  tableName: { color: '#E0E8F0', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  tableSku: { color: '#667788', fontSize: 10, marginTop: 1 },
  tableBin: { color: '#60A5FA', fontSize: 11, marginTop: 2 },
  tableMeta: { color: '#10B981', fontSize: 10, marginTop: 2 },
  tableBatch: { color: '#8899AA', fontSize: 11 },
  tableQty: { color: '#B0C4D8', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: '#10B981' },
  badgeSkipped: { backgroundColor: '#EF4444' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  completeIconBtn: { backgroundColor: '#10B981', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  completeIconText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scanIconBtn: { backgroundColor: '#1A3A5C', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scanIconText: { fontSize: 15 },
  skipIconBtn: { backgroundColor: '#374151', width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  skipIconText: { color: '#9CA3AF', fontSize: 16, fontWeight: '700' },

  // Bin input + resolved row (AssignView-style)
  binRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1F2937', borderRadius: 12, margin: 16, marginTop: 0,
    padding: 4, paddingLeft: 12,
  },
  binInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cubeIcon: { marginRight: 6, fontSize: 16 },
  binInput: { flex: 1, fontSize: 16, color: '#F9FAFB', paddingVertical: 10 },
  scanBtn: { padding: 8 },
  scanIcon: { fontSize: 18 },
  goBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  goBtnDisabled: { backgroundColor: '#1E3A5F' },
  goBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  resolvingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 8 },
  resolvingText: { color: '#9CA3AF', fontSize: 14 },
  resolvedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#064E3B', borderRadius: 10, padding: 12,
  },
  resolvedInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  checkIcon: { fontSize: 16 },
  resolvedPath: { fontSize: 14, color: '#34D399', fontWeight: '500', flex: 1 },
  assignAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  btnDisabled: { opacity: 0.5 },
  assignIcon: { fontSize: 14 },
  assignAllText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Table child rows + assign buttons
  tableRowChild: { backgroundColor: '#0F1923' },
  tableChildName: { color: '#8899AA', fontSize: 12, fontFamily: 'monospace' },
  assignBtn: { backgroundColor: '#1A73E8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  assignBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  skipBtnSmall: { backgroundColor: '#374151', width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  skipBtnSmallText: { color: '#9CA3AF', fontSize: 14, fontWeight: '700' },

  // Scanner modal
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerCloseBtn: {
    position: 'absolute', top: 50, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8,
  },
  closeIcon: { color: '#fff', fontSize: 24, lineHeight: 26 },

  // List
  listContent: { padding: 24, paddingBottom: 40 },
  listCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  listCardCompleted: { opacity: 0.6 },
  listCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listNo: { color: '#fff', fontSize: 18, fontWeight: '700' },
  listStatus: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  listStatusPending: { backgroundColor: '#F59E0B' },
  listStatusDone: { backgroundColor: '#10B981' },
  listStatusText: { fontSize: 12, fontWeight: '600' },
  listStatusTextPending: { color: '#fff' },
  listStatusTextDone: { color: '#fff' },
  progressBar: {
    height: 6,
    backgroundColor: '#2A3A4A',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#1A73E8',
    borderRadius: 3,
  },
  listDetail: { color: '#8899AA', fontSize: 13 },

  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#8899AA', fontSize: 18, fontWeight: '600' },
  emptySubtext: { color: '#667788', fontSize: 14, marginTop: 8, textAlign: 'center' },

  // Error / loading banners
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },
  loadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  loadingText: { color: '#8899AA', fontSize: 13 },

  // Warning
  warningBanner: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    padding: 14,
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 10,
  },
  warningBannerText: { color: '#F59E0B', fontSize: 13 },

  // Detail
  detailContent: { padding: 24, paddingBottom: 40 },
  itemCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  itemCardDone: { borderColor: '#10B981', opacity: 0.7 },
  itemCardSkipped: { borderColor: '#EF4444', opacity: 0.6 },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemSku: { color: '#fff', fontSize: 17, fontWeight: '700' },
  itemBatch: { color: '#8899AA', fontSize: 12, marginTop: 2 },
  itemStatusBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  itemStatusDone: { backgroundColor: '#10B981' },
  itemStatusSkipped: { backgroundColor: '#EF4444' },
  itemStatusText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  itemDetails: { marginTop: 14, gap: 8 },
  itemDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetailLabel: { color: '#667788', fontSize: 13, width: 50 },
  itemDetailValue: { color: '#B0C4D8', fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
  itemBinCode: { color: '#1A73E8', fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' },

  itemActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  completeButton: {
    flex: 2,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completeButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  skipButton: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: { color: '#9CA3AF', fontSize: 15, fontWeight: '500' },
  completedAt: { color: '#10B981', fontSize: 11, marginTop: 8 },

  allDoneBanner: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    padding: 20,
    marginHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  allDoneText: { color: '#10B981', fontSize: 15, textAlign: 'center', fontWeight: '500' },

  // Route / walking order
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  routeBadge: {
    backgroundColor: '#1A73E8',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBadgeDone: { backgroundColor: '#10B981' },
  routeBadgeSkipped: { backgroundColor: '#EF4444' },
  routeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  routeLabel: { color: '#8899AA', fontSize: 12, fontWeight: '600' },
  itemCardCurrent: { borderColor: '#1A73E8', borderWidth: 2 },
  itemSkuSub: { color: '#667788', fontSize: 12, marginTop: 1 },

  // Detail progress bar
  detailProgressBarWrap: { paddingHorizontal: 24, marginTop: 12, marginBottom: 4 },
  detailProgressBar: { height: 6, backgroundColor: '#2A3A4A', borderRadius: 3 },
  detailProgressFill: { height: 6, backgroundColor: '#1A73E8', borderRadius: 3 },

  // Direct Put-Away button
  directPutawayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2A4A6C',
  },
  directPutawayIcon: { fontSize: 28 },
  directPutawayTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  directPutawaySubtitle: { color: '#60A5FA', fontSize: 12, marginTop: 2 },
  directPutawayArrow: { color: '#60A5FA', fontSize: 22, fontWeight: '700' },

  // Scan bin button
  scanBinButton: {
    flex: 1,
    backgroundColor: '#1A3A5C',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanBinButtonText: { color: '#60A5FA', fontSize: 14, fontWeight: '500' },

  // Skip reason
  skippedReason: { color: '#EF4444', fontSize: 11, marginTop: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1A2332',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalSubtitle: { color: '#8899AA', fontSize: 14, marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0F1923',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    color: '#fff',
    fontSize: 14,
    padding: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { color: '#9CA3AF', fontSize: 15, fontWeight: '500' },
  modalConfirmButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

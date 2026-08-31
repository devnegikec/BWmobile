// ============================================================
// SummaryView.styles — shared styles for the inbound session summary
// ============================================================
import { StyleSheet, Platform } from 'react-native';

export const styles = StyleSheet.create({
  summaryContent: {
    paddingBottom: 40,
  },
  summaryAsnRef: {
    color: '#60A5FA',
    fontSize: 13,
    marginTop: 12,
    marginHorizontal: 24,
  },
  rejectionSummaryBar: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    marginHorizontal: 24,
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  rejectionSummaryText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  unifiedTable: {
    marginHorizontal: 5,
    marginTop: 16,
    backgroundColor: '#1A2332',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3A4A',
    overflow: 'hidden',
  },
  utColHeaders: {
    flexDirection: 'row',
    backgroundColor: '#0F1923',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  utColHeader: {
    color: '#667788',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  utColProduct: { flex: 5, minWidth: 0 },
  utColBatch: { flex: 2, minWidth: 0 },
  utColBoxes: { width: 55, alignItems: 'center' as const },
  utColAction: { width: 62, alignItems: 'flex-end' as const },
  utRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0F1923',
  },
  utRowChild: {
    backgroundColor: '#0F1923',
    paddingLeft: 6,
  },
  utRowRejected: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  utCell: {
    justifyContent: 'center',
  },
  utProductName: {
    color: '#E0E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  utSerialNumber: {
    color: '#8899AA',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  utSku: {
    color: '#667788',
    fontSize: 10,
    marginTop: 1,
  },
  utBatch: {
    color: '#8899AA',
    fontSize: 11,
  },
  utBoxItems: {
    color: '#B0C4D8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  utTextRejected: {
    color: '#FCA5A5',
    textDecorationLine: 'line-through' as const,
  },
  utRejectBtn: {
    backgroundColor: '#2A3A4A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  utRejectBtnActive: {
    backgroundColor: '#EF4444',
  },
  utRejectBtnText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
  },
  utRejectBtnTextActive: {
    color: '#fff',
  },
  utUndoBtn: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  utUndoBtnText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700',
  },
  rejectListContainer: {
    marginHorizontal: 5,
    marginTop: 24,
    backgroundColor: '#1A2332',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    overflow: 'hidden',
  },
  rejectListHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EF4444',
  },
  rejectListTitle: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  rejectListReason: {
    color: '#FCA5A5',
    fontSize: 9,
    marginTop: 2,
  },
  summaryActions: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#B0C4D8',
    fontSize: 15,
    fontWeight: '600',
  },
  endButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

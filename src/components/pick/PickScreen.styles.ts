// ============================================================
// PickScreen.styles — shared styles for the pick screen
// ============================================================
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F1923' },

    // Header
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

    // List
    listContent: { paddingHorizontal: 16, paddingBottom: 24 },
    listCard: {
        backgroundColor: '#1A2332', borderRadius: 12, borderWidth: 1, borderColor: '#2A3A4A',
        padding: 14, marginBottom: 10,
    },
    listCardCompleted: { opacity: 0.55 },
    listCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    listNo: { color: '#E0E8F0', fontSize: 15, fontWeight: '700' },
    listStatus: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    listStatusDraft: { backgroundColor: '#1E3A5F' },
    listStatusActive: { backgroundColor: '#1A73E8' },
    listStatusText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    listInvoice: { color: '#8899AA', fontSize: 12, marginTop: 4 },
    progressBar: { height: 6, backgroundColor: '#2A3A4A', borderRadius: 3, marginTop: 10, overflow: 'hidden' },
    progressFill: { height: 6, backgroundColor: '#1A73E8', borderRadius: 3 },
    listDetail: { color: '#8899AA', fontSize: 12, marginTop: 6 },

    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 44 },
    emptyText: { color: '#E0E8F0', fontSize: 16, fontWeight: '600', marginTop: 12 },
    emptySubtext: { color: '#667788', fontSize: 13, marginTop: 4, textAlign: 'center' },

    // Error / loading banners
    errorBanner: { backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, marginBottom: 8, borderRadius: 8 },
    errorText: { color: '#FCA5A5', fontSize: 13 },
    loadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    loadingText: { color: '#8899AA', fontSize: 13 },

    // Detail progress
    detailProgressWrap: { paddingHorizontal: 16, marginBottom: 8 },
    detailProgressBar: { height: 8, backgroundColor: '#2A3A4A', borderRadius: 4, overflow: 'hidden' },
    detailProgressFill: { height: 8, backgroundColor: '#10B981', borderRadius: 4 },
    detailProgressText: { color: '#8899AA', fontSize: 12, marginTop: 4, textAlign: 'right' },

    // Scan row
    scanRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#1F2937', borderRadius: 12, marginHorizontal: 16, marginBottom: 8,
        padding: 4, paddingLeft: 12,
    },
    scanInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    scanIcon: { marginRight: 6, fontSize: 16 },
    scanInput: { flex: 1, fontSize: 16, color: '#F9FAFB', paddingVertical: 10 },
    cameraBtn: { padding: 8 },
    cameraIcon: { fontSize: 20 },
    scanBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    scanBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    btnDisabled: { backgroundColor: '#1E3A5F', opacity: 0.6 },

    // Action bar
    actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
    workerText: { color: '#8899AA', fontSize: 13, flex: 1 },
    reassignBtn: { backgroundColor: '#1A3A5C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    reassignText: { color: '#60A5FA', fontSize: 12, fontWeight: '600' },

    // Table
    tableContent: { paddingHorizontal: 16, paddingBottom: 16 },
    tableHeaders: {
        flexDirection: 'row', backgroundColor: '#0F1923',
        paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#2A3A4A',
    },
    tableHeader: { color: '#667788', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    colProduct: { flex: 5, minWidth: 0 },
    colBatch: { flex: 2, minWidth: 0 },
    colQty: { width: 44, textAlign: 'center' },
    colPicked: { width: 52, textAlign: 'right' },

    tableRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2332',
        borderWidth: 1, borderColor: '#2A3A4A', borderRadius: 10,
        paddingVertical: 10, paddingHorizontal: 10, marginBottom: 8,
    },
    tableRowChild: { backgroundColor: '#111B28', marginTop: -4, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
    tableCell: { justifyContent: 'center' },
    tableName: { color: '#E0E8F0', fontSize: 13, fontWeight: '700', flexShrink: 1 },
    tableSku: { color: '#667788', fontSize: 10, marginTop: 1 },
    tableBin: { color: '#60A5FA', fontSize: 10, marginTop: 2 },
    tableBatch: { color: '#8899AA', fontSize: 11 },
    tableQty: { color: '#B0C4D8', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    serialText: { color: '#E0E8F0', fontSize: 11, fontFamily: 'monospace' },
    serialMeta: { color: '#8899AA', fontSize: 10 },

    // Footer
    footer: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 24 },
    footerCancelBtn: { flex: 1, borderWidth: 1, borderColor: '#EF4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    footerCancelText: { color: '#EF4444', fontWeight: '600' },
    footerCompleteBtn: { flex: 2, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    footerCompleteText: { color: '#fff', fontWeight: '700' },

    // Scanner
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scannerCloseBtn: { position: 'absolute', top: 50, right: 20, backgroundColor: '#1F2937', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    closeIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },

    // Reassign modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalContent: { backgroundColor: '#1A2332', borderRadius: 14, padding: 18 },
    modalTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 12 },
    workerRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A3A4A' },
    workerName: { color: '#E0E8F0', fontSize: 14, fontWeight: '600' },
    workerMeta: { color: '#8899AA', fontSize: 11, marginTop: 2 },
    modalCancelBtn: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
    modalCancelText: { color: '#8899AA', fontSize: 14 },
});

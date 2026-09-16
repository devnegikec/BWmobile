// ============================================================
// AssignBinScreen.styles — shared styles for the assign-bin screen
// ============================================================
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1923',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#1A2332',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSelector: {
    marginTop: 10,
  },
  headerSubtitle: {
    color: '#8899AA',
    fontSize: 14,
    marginTop: 8,
  },

  // ---- Idle ----
  idleContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButton: {
    width: 320,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonIcon: {
    fontSize: 56,
    marginBottom: 4,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },

  // ---- Scanning ----
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A2332',
    paddingHorizontal: 24,
    paddingTop: 55,
    paddingBottom: 12,
  },
  statusLeft: {
    flex: 1,
  },
  statusLabel: {
    color: '#1A73E8',
    fontSize: 12,
    fontWeight: '600',
  },
  statusRight: {
    alignItems: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  statusCount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statusCountLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    textTransform: 'uppercase',
  },

  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 12,
  },

  // ---- Review ----
  reviewContent: {
    paddingBottom: 40,
  },
  reviewCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    margin: 24,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#2A3A4A',
  },
  reviewSectionTitle: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  reviewLabel: {
    color: '#8899AA',
    fontSize: 14,
  },
  reviewValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    color: '#1A73E8',
    fontSize: 14,
    fontWeight: '600',
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A4A',
  },
  itemInfo: {
    flex: 1,
  },
  itemSku: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  itemName: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  itemMetaText: {
    color: '#667788',
    fontSize: 11,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#667788',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },

  reviewActions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
  },

  // ---- Submitting / Success / Centered ----
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  centeredTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  centeredSubtitle: {
    color: '#8899AA',
    fontSize: 14,
  },
  successIcon: {
    fontSize: 56,
  },
  successCard: {
    backgroundColor: '#1A2332',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1A73E8',
    width: '100%',
    gap: 4,
    alignItems: 'center',
  },
  successDetail: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successPath: {
    color: '#8899AA',
    fontSize: 12,
    marginTop: 2,
  },

  // ---- Shared ----
  primaryButton: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    flex: 1,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#2A3A4A',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#B0C4D8',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: 12,
  },
});

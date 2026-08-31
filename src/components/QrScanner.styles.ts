// ============================================================
// QrScanner.styles — shared styles for the QR scanner variants
// ============================================================
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    padding: 24,
  },
  loadingText: { color: '#fff', fontSize: 16 },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#1A73E8',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonOutline: {
    borderWidth: 1,
    borderColor: '#1A73E8',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonOutlineText: { color: '#1A73E8', fontSize: 16, fontWeight: '600' },
  cancelButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  cancelButtonText: { color: '#aaa', fontSize: 16 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },

  scanBox: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#1A73E8',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },

  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 32,
    textAlign: 'center',
  },
  subtitle: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  // Scan success indicator (brief flash after each scan)
  scannedIndicator: {
    marginTop: 16,
    backgroundColor: 'rgba(34,197,94,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.5)',
  },
  scannedIndicatorText: {
    color: '#22C55E',
    fontSize: 14,
    fontWeight: '600',
  },

  // Switch button (camera ↔ hardware)
  switchButton: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  switchButtonText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },

  // Hardware scanner feedback
  scannedBubble: {
    marginTop: 16,
    backgroundColor: 'rgba(26,115,232,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scannedText: { color: '#fff', fontSize: 14 },

  // DataWedge help
  helpBox: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    borderRadius: 10,
    width: '85%',
  },
  helpTitle: {
    color: '#FFD54F',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  helpText: {
    color: '#ccc',
    fontSize: 12,
    lineHeight: 18,
  },

  // Hidden input for DataWedge capture
  hiddenInput: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    width: 1,
    height: 1,
    opacity: 0,
  },
});

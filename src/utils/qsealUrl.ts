// ============================================================
// QSeal URL helpers — shared QR data utilities
// ============================================================

/** Check if scanned data is a QSeal URL (parent box). */
export function isQSealUrl(data: string): boolean {
  const t = data.trim();
  return t.startsWith('http://') || t.startsWith('https://');
}

/**
 * Extract serial number from a QSeal URL, or null if not a QSeal URL.
 * Supports both URL patterns:
 *   Pattern A: /qseal/{SERIAL}   e.g. https://.../qseal/QSL5E248FC
 *   Pattern B: /s/{SERIAL}/...   e.g. https://.../g/SKU/s/JV9HKW/12345
 */
export function extractQSealSerial(qrData: string): string | null {
  const trimmed = qrData.trim();
  if (!isQSealUrl(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Pattern A: /qseal/{SERIAL}
    const qsealIdx = pathParts.indexOf('qseal');
    if (qsealIdx !== -1 && qsealIdx + 1 < pathParts.length) {
      return pathParts[qsealIdx + 1];
    }

    // Pattern B: /s/{SERIAL}/...
    const sIdx = pathParts.indexOf('s');
    if (sIdx !== -1 && sIdx + 1 < pathParts.length) {
      return pathParts[sIdx + 1];
    }
  } catch {}
  return null;
}

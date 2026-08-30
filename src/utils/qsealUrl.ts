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
 * Supports URL patterns:
 *   Pattern A: /qseal/{SERIAL}        e.g. https://.../qseal/QSL5E248FC
 *   Pattern B: /s/{SERIAL}/...        e.g. https://.../g/SKU/s/JV9HKW/12345
 *   Pattern C: /01/{gtin}/21/{serial} e.g. https://.../01/09520123456788/21/C00001234
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

    // Pattern C: GS1 SGTIN /01/{gtin}/21/{serial}
    const gs1Idx = pathParts.indexOf('21');
    if (gs1Idx >= 2 && pathParts[gs1Idx - 2] === '01' && gs1Idx + 1 < pathParts.length) {
      return pathParts[gs1Idx + 1];
    }

    // Pattern B: /s/{SERIAL}/...
    const sIdx = pathParts.indexOf('s');
    if (sIdx !== -1 && sIdx + 1 < pathParts.length) {
      return pathParts[sIdx + 1];
    }
  } catch {}
  return null;
}

/**
 * Extract the serial from a PARENT QSeal URL (/qseal/{SERIAL}), or null.
 * Only matches the parent pattern so child/GS1 URLs are not misread as boxes.
 */
export function extractQSealParentSerial(qrData: string): string | null {
  const trimmed = qrData.trim();
  if (!isQSealUrl(trimmed)) return null;
  try {
    const pathParts = new URL(trimmed).pathname.split('/').filter(Boolean);
    const qsealIdx = pathParts.indexOf('qseal');
    if (qsealIdx !== -1 && qsealIdx + 1 < pathParts.length) {
      return pathParts[qsealIdx + 1];
    }
  } catch {}
  return null;
}

/**
 * Extract serial number from QSeal URL, GS1 URL, or raw QR data.
 * URLs: /qseal/{SERIAL}, /s/{SERIAL}/..., or /01/{gtin}/21/{serial}.
 * Plain text returns as-is.
 */
export function extractSerial(data: string): string | null {
  const t = data.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const parts = new URL(t).pathname.split('/').filter(Boolean);
      const qIdx = parts.indexOf('qseal');
      if (qIdx !== -1 && qIdx + 1 < parts.length) return parts[qIdx + 1];
      // GS1 Digital Link SGTIN: /01/{gtin}/21/{serial}
      const gs1Idx = parts.indexOf('21');
      if (gs1Idx >= 2 && parts[gs1Idx - 2] === '01' && gs1Idx + 1 < parts.length) {
        return parts[gs1Idx + 1];
      }
      const sIdx = parts.indexOf('s');
      if (sIdx !== -1 && sIdx + 1 < parts.length) return parts[sIdx + 1];
    } catch {}
    return null;
  }
  return t;
}

/** Check if scanned data is a QSeal URL (parent box). */
export function isQSealUrl(data: string): boolean {
  return data.trim().startsWith('http://') || data.trim().startsWith('https://');
}

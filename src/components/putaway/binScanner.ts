// ============================================================
// Bin QR Scanner — Parse bin QR codes + lookup by QR code
// Supports: 5-char codes and legacy JSON location payloads
// ============================================================
import { coreClient } from '../../api/client';

export interface BinInfo {
  location_id: string;   // UUID for API calls
  qr_code: string;       // 5-char code
  full_path: string;     // "Z01-A03-B02-L04-B01" for display
  location_code: string; // "BN01" for short display
}

/**
 * Parse scanned bin QR data.
 * - If it's a 5-char alphanumeric code → returns as-is (needs API lookup)
 * - If it's JSON with location_id → extracts UUID directly
 * Returns null if neither format matches.
 */
export function parseBinQR(data: string): BinInfo | null {
  const trimmed = data.trim();

  // ── 5-char alphanumeric code (new format) ──
  if (/^[A-Z0-9]{5}$/i.test(trimmed)) {
    return {
      location_id: '',   // needs API lookup
      qr_code: trimmed.toUpperCase(),
      full_path: '',
      location_code: '',
    };
  }

  // ── JSON payload (legacy format) ──
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.type === 'location' && parsed.location_id) {
      return {
        location_id: parsed.location_id,
        qr_code: parsed.qr_code || parsed.bin_code || '',
        full_path: parsed.full_path || parsed.location_code || '',
        location_code: parsed.location_code || '',
      };
    }
    // Legacy alt format
    if (parsed.bin_id && parsed.bin_code) {
      return {
        location_id: parsed.bin_id,
        qr_code: parsed.bin_code,
        full_path: parsed.full_path || parsed.bin_code,
        location_code: parsed.bin_code,
      };
    }
  } catch {}

  return null;
}

/**
 * Lookup a bin location by 5-char QR code.
 * Returns BinInfo with location_id (UUID) populated.
 */
export async function lookupBinByQr(qrCode: string): Promise<BinInfo | null> {
  try {
    const { data } = await coreClient.get(
      `/warehouse-locations/by-qr/${encodeURIComponent(qrCode.toUpperCase())}`,
      { timeout: 8000 }
    );
    return {
      location_id: data.id || data.location_id,
      qr_code: data.qr_code || qrCode,
      full_path: data.full_path || '',
      location_code: data.location_code || data.code || '',
    };
  } catch {
    return null;
  }
}

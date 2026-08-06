// ============================================================
// QSeal Store — Zustand store for Parent-Child cascade flow
// ============================================================
import { create } from 'zustand';
import * as qsealService from '../api/qsealService';

// ---- Local-only scanned item (no backend lookup) ----
export interface ScannedQSeal {
  /** Serial number extracted from the QR code */
  serialNumber: string;
  /** Timestamp when scanned */
  scannedAt: number;
}

type CascadeMode = 'none' | 'parent-first' | 'child-first';

interface QSealState {
  // ---- Cascade State ----
  parent: ScannedQSeal | null;
  children: ScannedQSeal[];
  cascadeMode: CascadeMode;
  isSubmitting: boolean;
  lastMapResult: { mapped_count: number; message: string } | null;
  error: string | null;

  // ---- Actions ----
  /** Set the parent serial (scanned as parent) */
  setParent: (serialNumber: string) => void;
  /** Add a child serial to the batch */
  addChild: (serialNumber: string) => void;
  /** Remove a child from the batch */
  removeChild: (serialNumber: string) => void;
  /** Send map request to backend with all scanned serials */
  finalizeCascade: () => Promise<{ mapped_count: number; message: string } | null>;
  /** Reset the entire cascade flow */
  resetCascade: () => void;
  /** Clear only the error */
  clearError: () => void;
}

export const useQSealStore = create<QSealState>((set, get) => ({
  parent: null,
  children: [],
  cascadeMode: 'none',
  isSubmitting: false,
  lastMapResult: null,
  error: null,

  // ---- Set Parent ----
  setParent: (serialNumber: string) => {
    const { parent, children } = get();
    set({ error: null });

    if (parent && parent.serialNumber !== serialNumber) {
      set({ error: 'A parent is already set. Reset the cascade first to scan a new parent.' });
      return;
    }

    const scanned: ScannedQSeal = { serialNumber, scannedAt: Date.now() };

    // Child-first flow: children exist, now parent is being set → ready to link
    if (children.length > 0) {
      set({ parent: scanned, cascadeMode: 'child-first' });
      return;
    }

    // Parent-first flow: no children yet
    set({ parent: scanned, cascadeMode: 'parent-first' });
  },

  // ---- Add Child ----
  addChild: (serialNumber: string) => {
    const { parent, children, cascadeMode } = get();
    set({ error: null });

    // Duplicate check
    if (children.some((c) => c.serialNumber === serialNumber)) {
      set({ error: `Serial "${serialNumber}" is already in the batch.` });
      return;
    }

    // Parent can't also be a child
    if (parent && parent.serialNumber === serialNumber) {
      set({ error: `Serial "${serialNumber}" is already set as the parent.` });
      return;
    }

    const scanned: ScannedQSeal = { serialNumber, scannedAt: Date.now() };

    // No parent yet → child-first flow
    if (!parent) {
      set({ children: [...children, scanned], cascadeMode: 'child-first' });
      return;
    }

    // Parent-first flow
    set({ children: [...children, scanned] });
  },

  // ---- Remove Child ----
  removeChild: (serialNumber: string) => {
    const { children } = get();
    set({ children: children.filter((c) => c.serialNumber !== serialNumber) });
  },

  // ---- Finalize (send map to backend) ----
  finalizeCascade: async () => {
    const { parent, children } = get();
    if (!parent) {
      set({ error: 'No parent QSeal has been scanned yet.' });
      return null;
    }
    if (children.length === 0) {
      set({ error: 'No child QSeals have been scanned yet.' });
      return null;
    }

    set({ isSubmitting: true, error: null });
    try {
      // Send serial numbers as IDs — backend resolves/looks up by serial
      const result = await qsealService.mapChildren(parent.serialNumber, {
        child_ids: children.map((c) => c.serialNumber),
      });
      set({
        isSubmitting: false,
        lastMapResult: { mapped_count: result.mapped_count, message: result.message },
        children: [],
      });
      return result;
    } catch (err: any) {
      const detail =
        err.response?.data?.detail || err.message || 'Failed to link QSeals. Please try again.';
      set({ isSubmitting: false, error: detail });
      return null;
    }
  },

  // ---- Reset ----
  resetCascade: () => {
    set({
      parent: null,
      children: [],
      cascadeMode: 'none',
      isSubmitting: false,
      lastMapResult: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));

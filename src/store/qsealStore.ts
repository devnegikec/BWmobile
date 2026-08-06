// ============================================================
// QSeal Store — Zustand store for Parent-Child cascade flow
// ============================================================
import { create } from 'zustand';
import type { QSealNode } from '../types';
import * as qsealService from '../api/qsealService';

type CascadeMode = 'none' | 'parent-first' | 'child-first';

interface QSealState {
  // ---- Cascade State ----
  parent: QSealNode | null;
  children: QSealNode[];
  cascadeMode: CascadeMode;
  isSubmitting: boolean;
  lastMapResult: { mapped_count: number; message: string } | null;
  error: string | null;

  // ---- Computed helpers ----
  /** Whether the parent has capacity for more children */
  isParentFull: () => boolean;
  /** Remaining capacity slots */
  remainingCapacity: () => number;

  // ---- Actions ----
  /** Called when a QSeal QR is scanned. Auto-detects parent vs child. */
  addScannedNode: (node: QSealNode) => void;
  /** Remove a child from the batch */
  removeChild: (nodeId: string) => void;
  /** Manually trigger the link/cascade API call */
  finalizeCascade: () => Promise<QSealMapResponse | null>;
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

  // ---- Computed ----
  isParentFull: () => {
    const { parent, children } = get();
    if (!parent || parent.capacity == null) return false;
    const totalAfterBatch = parent.children_count + children.length;
    return totalAfterBatch >= parent.capacity;
  },

  remainingCapacity: () => {
    const { parent, children } = get();
    if (!parent || parent.capacity == null) return Infinity;
    return Math.max(0, parent.capacity - parent.children_count - children.length);
  },

  // ---- Actions ----
  addScannedNode: (node: QSealNode) => {
    const { parent, children, cascadeMode } = get();
    set({ error: null });

    // --- Detect: is this a parent or child? ---
    // A node is a "parent" if it can have children (based on qseal_type hierarchy)
    const parentTypes = ['container', 'pallet', 'shipper'];
    const isParentType = parentTypes.includes(node.qseal_type);

    if (isParentType && !node.parent_id) {
      // ---- This node can act as a PARENT ----

      // If we already have a parent, prevent overwriting
      if (parent && parent.node_id !== node.node_id) {
        set({ error: 'A parent is already set. Complete or reset the current cascade first.' });
        return;
      }

      // If we already have children (child-first flow), this is the parent linking step
      if (children.length > 0 && cascadeMode === 'child-first') {
        // Check capacity before accepting
        const totalAfter = node.children_count + children.length;
        if (node.capacity != null && totalAfter > node.capacity) {
          set({
            error: `Parent capacity exceeded! Parent has ${node.capacity} slots, ${node.children_count} used, cannot add ${children.length} children (${totalAfter - node.capacity} over capacity).`,
          });
          return;
        }
        // Check if already cascaded
        if (node.app_cascade_map) {
          set({ error: 'This parent has already been cascaded and cannot be re-used.' });
          return;
        }
        set({ parent: node });
        return;
      }

      // Parent-first flow: no children yet, just set the parent
      if (children.length === 0) {
        // Check if already cascaded
        if (node.app_cascade_map) {
          set({ error: 'This parent has already been cascaded and cannot be re-used.' });
          return;
        }
        // Check if already full
        if (node.capacity != null && node.children_count >= node.capacity) {
          set({
            parent: node,
            cascadeMode: 'parent-first',
            error: `⚠️ This parent is already at full capacity (${node.children_count}/${node.capacity}). No more children can be added.`,
          });
          return;
        }
        set({ parent: node, cascadeMode: 'parent-first' });
        return;
      }
    }

    // ---- This node is a CHILD (or a node that already has a parent) ----
    if (node.parent_id) {
      set({ error: `This QSeal (${node.serial_number}) is already linked to another parent.` });
      return;
    }

    // Duplicate check
    if (children.some((c) => c.node_id === node.node_id)) {
      set({ error: `QSeal ${node.serial_number} is already in the batch.` });
      return;
    }

    // If we don't have a parent yet → child-first flow
    if (!parent) {
      const updatedChildren = [...children, node];
      set({ children: updatedChildren, cascadeMode: 'child-first' });
      return;
    }

    // Parent-first flow: add child to batch
    // Check type compatibility
    const compatibility: Record<string, string[]> = {
      container: ['pallet'],
      pallet: ['shipper'],
      shipper: ['box', 'unit'],
    };
    const validChildTypes = compatibility[parent.qseal_type] || [];
    if (validChildTypes.length > 0 && !validChildTypes.includes(node.qseal_type)) {
      set({
        error: `${node.qseal_type} cannot be linked to a ${parent.qseal_type}. Valid child types: ${validChildTypes.join(', ')}.`,
      });
      return;
    }

    // Check capacity
    const totalAfter = parent.children_count + children.length + 1;
    if (parent.capacity != null && totalAfter > parent.capacity) {
      set({
        error: `Cannot add this child. Parent capacity is full (${parent.children_count}/${parent.capacity}).`,
      });
      return;
    }

    const updatedChildren = [...children, node];
    set({ children: updatedChildren });
  },

  removeChild: (nodeId: string) => {
    const { children } = get();
    set({ children: children.filter((c) => c.node_id !== nodeId) });
  },

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
      const result = await qsealService.mapChildren(parent.node_id, {
        child_ids: children.map((c) => c.node_id),
      });
      set({
        isSubmitting: false,
        lastMapResult: { mapped_count: result.mapped_count, message: result.message },
        // Keep parent but clear children after successful map
        children: [],
        // Update parent children_count
        parent: parent
          ? { ...parent, children_count: parent.children_count + result.mapped_count }
          : null,
      });
      return result;
    } catch (err: any) {
      const detail =
        err.response?.data?.detail || err.message || 'Failed to link QSeals. Please try again.';
      set({ isSubmitting: false, error: detail });
      return null;
    }
  },

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

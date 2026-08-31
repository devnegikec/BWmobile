// ============================================================
// summaryTypes — shared table row type for the session summary
// ============================================================

export interface TableRow {
  key: string;
  type: 'qseal-parent' | 'qseal-child' | 'scan-batch';
  productName: string;
  sku: string;
  batchNumber: string;
  boxCount: number;
  itemCount: number;
  rejectKey: string;
  parentKey?: string;
  depth: number;
  isExpandable: boolean;
}

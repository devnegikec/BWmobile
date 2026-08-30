// ============================================================
// Common types — pagination, generic paginated responses, API errors
// ============================================================

// ---------- Pagination ----------
export interface Pagination {
  page: number;
  page_size: number;
  total_items?: number;
  total_pages?: number;
  total?: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  items?: T[];
  receiving_slips?: T[];
  asn_orders?: T[];
  put_away_lists?: T[];
  tracking_items?: T[];
  pagination: Pagination;
}

// ---------- API Error ----------
export interface ApiError {
  detail: string;
}

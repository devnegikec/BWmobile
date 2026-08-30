export interface BinInfo {
  bin_location_id: string;
  bin_code: string;
  full_path: string;
  warehouse_id: string;
  warehouse_name: string;
}

export interface ScannedItem {
  item_id: string;
  sku: string;
  name?: string;
  batch_number: string;
  quantity: number;
}

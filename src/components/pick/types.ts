import type { PickListItem } from '@/types';

export interface PickGroup {
    key: string;
    name: string;
    sku: string;
    children: PickListItem[];
}

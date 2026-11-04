import type { QuickAddPreset } from './types';

export const defaultQuickAddPresets: QuickAddPreset[] = [
  {
    id: 'general',
    label: 'General',
    note: '',
    category: 'Food & Drinks',
    order: 0,
  },
  {
    id: 'transport',
    label: 'Transport',
    note: 'Bus/MRT',
    category: 'Transportation',
    order: 1,
  },
];

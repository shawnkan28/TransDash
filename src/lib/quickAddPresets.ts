import type { QuickAddPreset } from './types';

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateQuickAddPresetId(): string {
  return `preset-${randomHex(16)}`;
}

export function sortQuickAddPresets(presets: QuickAddPreset[]): QuickAddPreset[] {
  return [...presets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

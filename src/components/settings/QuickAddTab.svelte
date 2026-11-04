<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { Plus, Trash2, Save } from 'lucide-svelte';
  import type { QuickAddPreset } from '../../lib/types';
  import { generateQuickAddPresetId } from '../../lib/quickAddPresets';

// Cross-tab options come from the saved store rather than another tab's
  // in-progress edits, which is also why each tab can now stand alone.
  const categoryLabels = $derived(financeStore.categories.map((category) => category.label));

  let quickAddPresets = $state<QuickAddPreset[]>(
    JSON.parse(JSON.stringify(financeStore.quickAddPresets))
  );

  let isSavingQuickAddPresets = $state(false);

  function addQuickAddPreset() {
    const nextOrder = quickAddPresets.reduce(
      (max, preset) => Math.max(max, preset.order ?? 0),
      -1
    ) + 1;
    quickAddPresets.push({
      id: generateQuickAddPresetId(),
      label: 'New Button',
      note: '',
      category: categoryLabels[0] ?? '',
      order: nextOrder,
    });
  }

  function removeQuickAddPreset(index: number) {
    quickAddPresets.splice(index, 1);
  }

  function setAmount(preset: QuickAddPreset, raw: string) {
    const amount = Number.parseFloat(raw);
    preset.amount = Number.isFinite(amount) ? amount : undefined;
  }

  async function saveQuickAddPresets() {
    for (const preset of quickAddPresets) {
      if (preset.amount !== undefined && preset.amount <= 0) {
        alert(`The default amount for "${preset.label}" must be more than 0, or left blank.`);
        return;
      }
    }

    const trimmed = quickAddPresets
      .map((preset, i) => ({
        id: preset.id.trim(),
        label: preset.label.trim(),
        note: preset.note.trim(),
        category: preset.category.trim(),
        ...(preset.amount !== undefined ? { amount: preset.amount } : {}),
        order: Number.isFinite(Number(preset.order)) ? Number(preset.order) : i,
      }))
      .filter((preset) => preset.label);

    const labels = trimmed.map((preset) => preset.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      alert('Each quick add button must have a unique label.');
      return;
    }

    for (const preset of trimmed) {
      if (!preset.category) {
        alert(`Choose a category for "${preset.label}".`);
        return;
      }
    }

    const previousIds = financeStore.quickAddPresets.map((preset) => preset.id);
    const nextIds = new Set(trimmed.map((preset) => preset.id));
    const removedIds = previousIds.filter((id) => !nextIds.has(id));

    isSavingQuickAddPresets = true;
    try {
      await db.quickAddPresets.bulkPut(trimmed);
      if (removedIds.length > 0) {
        await db.quickAddPresets.bulkDelete(removedIds);
      }

      await financeStore.persistAppSettings();
      await financeStore.loadData();
      quickAddPresets = JSON.parse(JSON.stringify(financeStore.quickAddPresets));

      alert('Quick add buttons saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save quick add buttons.');
    }
    isSavingQuickAddPresets = false;
  }
</script>

  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-surface">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Quick Add Buttons</h2>
        <p class="text-sm text-gray-500 mt-1">
          Shortcut buttons shown on mobile. Each one opens Add Transaction pre-filled with its note, category and amount.
        </p>
      </div>
      <div class="flex gap-3">
        <button onclick={addQuickAddPreset} class="flex items-center gap-2 px-4 py-2 bg-surface border border-accent-200 text-gray-700 rounded-xl hover:bg-accent-50 transition-colors shadow-sm font-medium text-sm">
          <Plus size={16} />
          Add Button
        </button>
        <button onclick={saveQuickAddPresets} disabled={isSavingQuickAddPresets} class="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-xl hover:bg-accent-500 transition-colors shadow-sm shadow-accent-200 font-medium text-sm disabled:opacity-50">
          <Save size={16} />
          {isSavingQuickAddPresets ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse min-w-[760px]">
        <thead>
          <tr class="bg-accent-50/50 text-gray-500 text-sm">
            <th class="px-6 py-4 font-semibold">Order</th>
            <th class="px-6 py-4 font-semibold">Button Label</th>
            <th class="px-6 py-4 font-semibold">Default Note</th>
            <th class="px-6 py-4 font-semibold">Default Category</th>
            <th class="px-6 py-4 font-semibold">Default Amount</th>
            <th class="px-6 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-accent-50">
          {#each quickAddPresets as preset, i (preset.id)}
            <tr class="hover:bg-accent-50/30 transition-colors align-top">
              <td class="px-6 py-3 align-top">
                <input
                  type="number"
                  step="1"
                  value={preset.order ?? i}
                  oninput={(event) => (preset.order = Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-16 rounded-lg border border-accent-200 px-2 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-6 py-3 align-top">
                <input
                  type="text"
                  bind:value={preset.label}
                  class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-6 py-3 align-top">
                <input
                  type="text"
                  bind:value={preset.note}
                  placeholder="Optional"
                  class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-6 py-3 align-top">
                <select
                  bind:value={preset.category}
                  class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                >
                  {#if preset.category && !categoryLabels.includes(preset.category)}
                    <option value={preset.category}>{preset.category}</option>
                  {/if}
                  {#each categoryLabels as label (label)}
                    <option value={label}>{label}</option>
                  {/each}
                </select>
              </td>
              <td class="px-6 py-3 align-top">
                <input
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                  value={preset.amount ?? ''}
                  placeholder="Optional"
                  oninput={(event) => setAmount(preset, (event.currentTarget as HTMLInputElement).value)}
                  class="w-28 px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-6 py-3 align-top text-right">
                <button onclick={() => removeQuickAddPreset(i)} class="inline-flex text-gray-400 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          {/each}
          {#if quickAddPresets.length === 0}
            <tr>
              <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                No quick add buttons configured. Add one to get started.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

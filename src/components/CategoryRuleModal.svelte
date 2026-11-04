<script lang="ts">
  import type { Category } from '../lib/types';
  import type { BudgetOption } from '../lib/monthlyBudget';
  import { X } from 'lucide-svelte';

  let {
    open = false,
    existingLabels = [],
    budgetOptions = { monthly: [], yearly: [], all: [] },
    onClose,
    onAdd,
  }: {
    open?: boolean;
    existingLabels?: string[];
    budgetOptions?: {
      monthly: BudgetOption[];
      yearly: BudgetOption[];
      all: BudgetOption[];
    };
    onClose?: () => void;
    onAdd?: (category: Category) => void;
  } = $props();

  let label = $state('');
  let transactionType = $state<'Expense' | 'Income'>('Expense');
  let categoryGroup = $state('General');
  let monthlyBudgetId = $state('');
  let affectCashFlow = $state(true);
  let error = $state('');

  function resetForm() {
    label = '';
    transactionType = 'Expense';
    categoryGroup = 'General';
    monthlyBudgetId = '';
    affectCashFlow = true;
    error = '';
  }

  function closeModal() {
    resetForm();
    onClose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      closeModal();
    }
  }

  function submit() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      error = 'Category label is required.';
      return;
    }

    const trimmedGroup = categoryGroup.trim();
    if (!trimmedGroup) {
      error = 'Category group is required.';
      return;
    }

    const duplicate = existingLabels.some(
      (existing) => existing.toLowerCase() === trimmedLabel.toLowerCase()
    );
    if (duplicate) {
      error = `A rule for "${trimmedLabel}" already exists.`;
      return;
    }

    onAdd?.({
      label: trimmedLabel,
      transactionType,
      categoryGroup: trimmedGroup,
      monthlyBudgetId: monthlyBudgetId || undefined,
      affectCashFlow,
    });
    closeModal();
  }

  $effect(() => {
    if (open) {
      resetForm();
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/40"
      aria-label="Close add rule dialog"
      onclick={closeModal}
    ></button>

    <div
      class="relative w-full max-w-md overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-category-rule-title"
    >
      <div class="flex items-start justify-between border-b border-gray-50 px-6 py-4">
        <div>
          <h2 id="add-category-rule-title" class="text-lg font-bold text-gray-900">Add Category Rule</h2>
          <p class="mt-1 text-sm text-gray-500">Create a new mapping for transaction categories.</p>
        </div>
        <button
          type="button"
          onclick={closeModal}
          class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <form
        class="space-y-4 px-6 py-5"
        onsubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div>
          <label for="rule-label" class="mb-1 block text-xs font-semibold text-gray-500">
            Category Label (matches CSV)
          </label>
          <input
            id="rule-label"
            type="text"
            bind:value={label}
            placeholder="e.g. Groceries"
            autocomplete="off"
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>

        <div>
          <label for="rule-type" class="mb-1 block text-xs font-semibold text-gray-500">
            Transaction Type
          </label>
          <select
            id="rule-type"
            bind:value={transactionType}
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          >
            <option value="Expense">Expense</option>
            <option value="Income">Income</option>
          </select>
        </div>

        <div>
          <label for="rule-group" class="mb-1 block text-xs font-semibold text-gray-500">
            Category Group
          </label>
          <input
            id="rule-group"
            type="text"
            bind:value={categoryGroup}
            placeholder="e.g. General"
            autocomplete="off"
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>

        <div>
          <label for="rule-budget" class="mb-1 block text-xs font-semibold text-gray-500">
            Budget (for this category label)
          </label>
          <select
            id="rule-budget"
            bind:value={monthlyBudgetId}
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          >
            <option value="">— None —</option>
            {#if budgetOptions.monthly.length > 0}
              <optgroup label="Monthly">
                {#each budgetOptions.monthly as budget (budget.id)}
                  <option value={budget.id}>{budget.name}</option>
                {/each}
              </optgroup>
            {/if}
            {#if budgetOptions.yearly.length > 0}
              <optgroup label="Yearly">
                {#each budgetOptions.yearly as budget (budget.id)}
                  <option value={budget.id}>{budget.name}</option>
                {/each}
              </optgroup>
            {/if}
          </select>
        </div>

        <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            bind:checked={affectCashFlow}
            class="h-4 w-4 rounded border-accent-300 text-accent-600 focus:ring-accent-600"
          />
          Affect Cash Flow
        </label>

        {#if error}
          <p class="text-sm font-medium text-rose-500">{error}</p>
        {/if}

        <div class="flex justify-end gap-3 border-t border-gray-50 pt-4">
          <button
            type="button"
            onclick={closeModal}
            class="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-xl bg-accent-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors hover:bg-accent-500"
          >
            Add Rule
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

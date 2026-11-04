<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { generateTransactionId } from '../lib/transactionId';
  import type { Transaction } from '../lib/types';
  import SearchableDropdown from './SearchableDropdown.svelte';
  import { X } from 'lucide-svelte';
  import { useBackButtonClose } from '../lib/backButtonClose.svelte';
  import { useBodyScrollLock } from '../lib/bodyScrollLock.svelte';

  let {
    transaction = null,
    open = false,
    mode = 'edit',
    statementOptions = [],
    createDefaults = {},
    onClose,
    onSaved,
  }: {
    transaction?: Transaction | null;
    open?: boolean;
    mode?: 'edit' | 'create';
    statementOptions?: string[];
    /** Prefills a new entry, e.g. with the account and statement being reviewed. */
    createDefaults?: { accountName?: string; currencyCode?: string; statement?: string };
    onClose?: () => void;
    onSaved?: () => void;
  } = $props();

  const isCreate = $derived(mode === 'create');

  useBackButtonClose(
    () => open && (isCreate || !!transaction),
    () => onClose?.()
  );

  useBodyScrollLock(() => open && (isCreate || !!transaction));

  let note = $state('');
  let dateInput = $state('');
  let valueInput = $state('');
  let currencyCode = $state('SGD');
  let exchangeRateInput = $state('1');
  let category = $state('');
  let accountName = $state('');
  let statement = $state('');
  let tripName = $state('');
  let generatedId = $state('');
  let isSaving = $state(false);
  let error = $state('');

  const categoryOptions = $derived(
    financeStore.categories.map((item) => item.label).sort((a, b) => a.localeCompare(b))
  );

  const accountOptions = $derived(
    financeStore.accounts
      .filter((item) => !item.disabled)
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b))
  );

  const currencyOptions = $derived.by(() => {
    const codes = new Set(
      financeStore.transactions.map((item) => item.currencyCode).filter(Boolean)
    );
    codes.add('SGD');
    codes.add('JPY');
    return [...codes].sort((a, b) => {
      if (a === 'SGD') return -1;
      if (b === 'SGD') return 1;
      return a.localeCompare(b);
    });
  });

  function handleCurrencyChange(next: string) {
    currencyCode = next;
    if (next === 'JPY') {
      exchangeRateInput = '100';
    } else if (next === 'SGD') {
      exchangeRateInput = '1';
    }
  }

  const selectedCategory = $derived(
    financeStore.categories.find((item) => item.label === category)
  );

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function toDateInput(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function applyDateInput(dateStr: string, existing: Date): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const next = new Date(existing);
    next.setFullYear(year, month - 1, day);
    return next;
  }

  function toDateRaw(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000000+08:00`;
  }

  function resetCreateForm() {
    const existingIds = financeStore.transactions.map((item) => item.id);
    generatedId = generateTransactionId(existingIds);
    note = '';
    dateInput = toDateInput(new Date());
    valueInput = '';
    exchangeRateInput = '1';
    handleCurrencyChange(createDefaults.currencyCode ?? 'SGD');
    category = '';
    accountName = createDefaults.accountName ?? accountOptions[0] ?? '';
    statement = createDefaults.statement ?? '';
    tripName = '';
    error = '';
  }

  function resetForm() {
    if (!transaction) return;

    note = transaction.note;
    dateInput = toDateInput(transaction.date);
    valueInput = String(transaction.value);
    currencyCode = transaction.currencyCode;
    exchangeRateInput = String(transaction.exchangeRate ?? 1);
    category = transaction.category;
    accountName = transaction.accountName;
    statement = transaction.statement ?? '';
    tripName = transaction.tripName ?? '';
    error = '';
  }

  $effect(() => {
    if (!open) return;

    if (isCreate) {
      resetCreateForm();
    } else if (transaction) {
      resetForm();
    }
  });

  function closeModal() {
    onClose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeModal();
  }

  async function saveChanges() {
    const value = Number.parseFloat(valueInput);
    const exchangeRate = Number.parseFloat(exchangeRateInput);

    if (!note.trim()) {
      error = 'Note is required.';
      return;
    }
    if (!Number.isFinite(value)) {
      error = 'Enter a valid amount.';
      return;
    }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      error = 'Enter a valid exchange rate.';
      return;
    }
    if (!category.trim()) {
      error = 'Category is required.';
      return;
    }
    if (!accountName.trim()) {
      error = 'Account is required.';
      return;
    }

    isSaving = true;
    error = '';

    try {
      const baseDate = isCreate ? new Date() : transaction!.date;
      const nextDate = applyDateInput(dateInput, baseDate);
      const payload = {
        note: note.trim(),
        date: nextDate,
        dateRaw: toDateRaw(nextDate),
        value,
        currencyCode: currencyCode.trim(),
        exchangeRate,
        category: category.trim(),
        accountName: accountName.trim(),
        statement,
        tripName: tripName.trim(),
      };

      if (isCreate) {
        await financeStore.createTransaction(payload);
      } else {
        await financeStore.updateTransaction(transaction!.id, payload);
      }

      alert('Entry saved.');
      onSaved?.();
      closeModal();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save transaction.';
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && (isCreate || transaction)}
  <div class="fixed inset-0 z-50 flex md:items-center md:justify-center md:p-4">
    <!-- Desktop only: mobile matches the Add Transaction sheet, which is a
         solid full-screen panel with no tap-to-close backdrop behind it. -->
    <button
      type="button"
      class="absolute inset-0 hidden bg-black/40 md:block"
      aria-label="Close edit dialog"
      onclick={closeModal}
    ></button>

    <div
      class="relative flex h-full w-full flex-col overflow-hidden bg-surface
             md:h-auto md:max-h-[90vh] md:max-w-xl md:rounded-[20px] md:border md:border-gray-100 md:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-transaction-title"
    >
      <div
        class="flex flex-shrink-0 items-start justify-between border-b border-gray-50 px-6 py-4"
        style="padding-top: calc(env(safe-area-inset-top, 0px) + 1rem);"
      >
        <div>
          <h2 id="edit-transaction-title" class="text-lg font-bold text-gray-900">
            {isCreate ? 'New Entry' : 'Edit Entry'}
          </h2>
          <p class="mt-1 text-sm text-gray-500">
            {#if isCreate}
              Transaction ID: <span class="font-mono font-semibold text-gray-700">{generatedId}</span>
            {:else}
              TXN-{transaction!.id.substring(0, 8).toUpperCase()}
            {/if}
          </p>
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

      <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div>
          <label for="edit-note" class="mb-1 block text-xs font-semibold text-gray-500">Note</label>
          <input
            id="edit-note"
            type="text"
            bind:value={note}
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="edit-date" class="mb-1 block text-xs font-semibold text-gray-500">Date</label>
            <input
              id="edit-date"
              type="date"
              bind:value={dateInput}
              class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <div>
            <label for="edit-value" class="mb-1 block text-xs font-semibold text-gray-500">Amount</label>
            <input
              id="edit-value"
              type="number"
              step="0.01"
              bind:value={valueInput}
              class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span class="mb-1 block text-xs font-semibold text-gray-500">Currency</span>
            <div class="flex rounded-xl border border-gray-200 p-1">
              {#each currencyOptions as code (code)}
                <button
                  type="button"
                  onclick={() => handleCurrencyChange(code)}
                  class="flex-1 rounded-lg py-2 text-sm font-semibold transition-colors
                         {currencyCode === code ? 'bg-accent-600 text-white' : 'text-gray-500 hover:bg-gray-50'}"
                >
                  {code}
                </button>
              {/each}
            </div>
          </div>
          <div>
            <label for="edit-rate" class="mb-1 block text-xs font-semibold text-gray-500">Exchange Rate</label>
            <input
              id="edit-rate"
              type="number"
              step="0.0001"
              min="0"
              bind:value={exchangeRateInput}
              class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
        </div>

        <div>
          <span class="mb-1 block text-xs font-semibold text-gray-500">Category</span>
          <SearchableDropdown bind:value={category} options={categoryOptions} placeholder="Search categories..." />
          {#if selectedCategory}
            <p class="mt-1 text-xs text-gray-500">
              {selectedCategory.transactionType} · {selectedCategory.categoryGroup}
              · Cash flow: {selectedCategory.affectCashFlow ? 'Yes' : 'No'}
            </p>
          {/if}
        </div>

        <div>
          <span class="mb-1 block text-xs font-semibold text-gray-500">Account</span>
          <SearchableDropdown bind:value={accountName} options={accountOptions} placeholder="Search accounts..." />
        </div>

        <div>
          <span class="mb-1 block text-xs font-semibold text-gray-500">Statement</span>
          <SearchableDropdown bind:value={statement} options={statementOptions} placeholder="Apr-26" />
        </div>

        <div>
          <label for="edit-trip" class="mb-1 block text-xs font-semibold text-gray-500">Trip Name</label>
          <input
            id="edit-trip"
            type="text"
            bind:value={tripName}
            placeholder="Optional"
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>

        {#if error}
          <p class="text-sm font-medium text-rose-500">{error}</p>
        {/if}
      </div>

      <div
        class="flex flex-shrink-0 items-center justify-end gap-3 border-t border-gray-50 px-6 py-4"
        style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);"
      >
        <button
          type="button"
          onclick={closeModal}
          class="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={saveChanges}
          disabled={isSaving}
          class="rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : isCreate ? 'Create Entry' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

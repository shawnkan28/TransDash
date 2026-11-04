<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { focusOnMount } from '../lib/focus';
  import SearchableDropdown from './SearchableDropdown.svelte';
  import MobileCardPayment from './MobileCardPayment.svelte';
  import { CreditCard, Plus, X } from 'lucide-svelte';
  import type { QuickAddPreset } from '../lib/types';
  import { useBackButtonClose } from '../lib/backButtonClose.svelte';
  import { useBodyScrollLock } from '../lib/bodyScrollLock.svelte';

  const DEFAULT_CATEGORY = 'Food & Drinks';
  const DEFAULT_ACCOUNT = 'OCBC 365';

  let open = $state(false);
  let amountInput = $state('');
  let note = $state('');
  let category = $state(DEFAULT_CATEGORY);
  let accountName = $state(DEFAULT_ACCOUNT);
  let currencyCode = $state('SGD');
  let exchangeRateInput = $state('1');
  let isSaving = $state(false);
  let error = $state('');
  let sheetTitle = $state('Add Transaction');
  let pickerOpen = $state(false);
  let paymentOpen = $state(false);

  // A single history entry covers the whole add-transaction flow (picker ->
  // sheet), since `pickerOpen` and `open` can flip in the same tick when a
  // preset is picked — two independent back-button hooks would race on the
  // shared browser history and close the sheet right after it opens.
  useBackButtonClose(
    () => open || pickerOpen || paymentOpen,
    () => {
      open = false;
      pickerOpen = false;
      paymentOpen = false;
    }
  );

  useBodyScrollLock(() => open || pickerOpen || paymentOpen);

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

  const selectedCategory = $derived(
    financeStore.categories.find((item) => item.label === category)
  );

  function resetForm(preset?: QuickAddPreset) {
    amountInput = preset?.amount ? String(preset.amount) : '';
    note = preset?.note ?? '';
    const presetCategory = preset?.category ?? '';
    category = categoryOptions.includes(presetCategory)
      ? presetCategory
      : categoryOptions.includes(DEFAULT_CATEGORY)
        ? DEFAULT_CATEGORY
        : (categoryOptions[0] ?? '');
    accountName = accountOptions.includes(DEFAULT_ACCOUNT)
      ? DEFAULT_ACCOUNT
      : (accountOptions[0] ?? '');
    currencyCode = 'SGD';
    exchangeRateInput = '1';
    error = '';
  }

  function openSheet(preset?: QuickAddPreset) {
    resetForm(preset);
    sheetTitle = preset ? `Add Transaction · ${preset.label}` : 'Add Transaction';
    open = true;
  }

  function closeSheet() {
    if (isSaving) return;
    open = false;
  }

  // Always a menu now: the card payment sits below the presets.
  function handleFabClick() {
    pickerOpen = true;
  }

  function selectPreset(preset?: QuickAddPreset) {
    pickerOpen = false;
    openSheet(preset);
  }

  function openCardPayment() {
    pickerOpen = false;
    paymentOpen = true;
  }

  function handleCurrencyChange(next: string) {
    currencyCode = next;
    if (next === 'JPY') {
      exchangeRateInput = '100';
    } else if (next === 'SGD') {
      exchangeRateInput = '1';
    }
  }

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function toDateRaw(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000000+08:00`;
  }

  async function handleAdd() {
    const value = Number.parseFloat(amountInput);
    const exchangeRate = Number.parseFloat(exchangeRateInput);

    if (!Number.isFinite(value) || value <= 0) {
      error = 'Enter a valid amount.';
      return;
    }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      error = 'Enter a valid exchange rate.';
      return;
    }
    if (!category.trim()) {
      error = 'Choose a category.';
      return;
    }
    if (!accountName.trim()) {
      error = 'Choose an account.';
      return;
    }

    isSaving = true;
    error = '';

    try {
      const now = new Date();
      await financeStore.createTransaction({
        note: note.trim(),
        date: now,
        dateRaw: toDateRaw(now),
        value,
        currencyCode: currencyCode.trim(),
        exchangeRate,
        category: category.trim(),
        accountName: accountName.trim(),
        statement: '',
        tripName: '',
      });
      open = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save transaction.';
    } finally {
      isSaving = false;
    }
  }
</script>

<button
  type="button"
  onclick={handleFabClick}
  class="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-600 text-white shadow-lg shadow-accent-300/50 transition-transform active:scale-95"
  aria-label="Add transaction"
>
  <Plus size={26} />
</button>

{#if pickerOpen}
  <div class="fixed inset-0 z-50 flex flex-col justify-end">
    <button
      type="button"
      class="absolute inset-0 bg-black/40"
      aria-label="Close"
      onclick={() => (pickerOpen = false)}
    ></button>

    <div
      class="relative rounded-t-3xl bg-surface p-5 shadow-[0_-8px_30px_-8px_rgba(0,0,0,0.2)]"
      style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem);"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-bold text-gray-900">Add Transaction</h2>
        <button
          type="button"
          onclick={() => (pickerOpen = false)}
          class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div class="space-y-2">
        {#each financeStore.quickAddPresets as preset (preset.id)}
          <button
            type="button"
            onclick={() => selectPreset(preset)}
            class="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-left transition-colors active:bg-gray-100"
          >
            <div class="min-w-0">
              <p class="font-semibold text-gray-900">{preset.label}</p>
              <p class="truncate text-xs text-gray-500">
                {preset.category}{preset.note ? ` · ${preset.note}` : ''}{preset.amount
                  ? ` · $${preset.amount.toFixed(2)}`
                  : ''}
              </p>
            </div>
            <Plus size={18} class="flex-shrink-0 text-accent-500" />
          </button>
        {:else}
          <button
            type="button"
            onclick={() => selectPreset()}
            class="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-left transition-colors active:bg-gray-100"
          >
            <p class="font-semibold text-gray-900">Transaction</p>
            <Plus size={18} class="flex-shrink-0 text-accent-500" />
          </button>
        {/each}

        <button
          type="button"
          onclick={openCardPayment}
          class="flex w-full items-center justify-between rounded-2xl border border-accent-100 bg-accent-50 px-4 py-3 text-left transition-colors active:bg-accent-100"
        >
          <div class="min-w-0">
            <p class="font-semibold text-gray-900">Add Credit Card Payment</p>
            <p class="truncate text-xs text-gray-500">Pay a card bill from a savings account</p>
          </div>
          <CreditCard size={18} class="flex-shrink-0 text-accent-500" />
        </button>
      </div>
    </div>
  </div>
{/if}

{#if paymentOpen}
  <MobileCardPayment onClose={() => (paymentOpen = false)} />
{/if}

{#if open}
  <div class="fixed inset-0 z-50 flex flex-col bg-surface">
    <div
      class="flex items-center justify-between border-b border-gray-100 px-5 pb-4"
      style="padding-top: calc(env(safe-area-inset-top, 0px) + 1rem);"
    >
      <h2 class="text-lg font-bold text-gray-900">{sheetTitle}</h2>
      <button
        type="button"
        onclick={closeSheet}
        class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Close"
      >
        <X size={20} />
      </button>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
      <div>
        <label for="qa-amount" class="mb-1 block text-xs font-semibold text-gray-500">Amount</label>
        <div class="relative">
          <span
            class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400"
          >
            {currencyCode === 'JPY' ? '¥' : '$'}
          </span>
          <input
            id="qa-amount"
            type="number"
            inputmode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            bind:value={amountInput}
            use:focusOnMount
            class="w-full rounded-2xl border border-gray-200 bg-gray-50 py-4 pl-10 pr-4 text-2xl font-bold text-gray-900 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>
      </div>

      <div>
        <label for="qa-note" class="mb-1 block text-xs font-semibold text-gray-500">Note</label>
        <input
          id="qa-note"
          type="text"
          placeholder="What was this for?"
          bind:value={note}
          class="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
        />
      </div>

      <div>
        <span class="mb-1 block text-xs font-semibold text-gray-500">Category</span>
        <SearchableDropdown
          bind:value={category}
          options={categoryOptions}
          placeholder="Search categories..."
        />
        {#if selectedCategory}
          <p class="mt-1 text-xs text-gray-500">
            {selectedCategory.transactionType} · {selectedCategory.categoryGroup}
          </p>
        {/if}
      </div>

      <div>
        <span class="mb-1 block text-xs font-semibold text-gray-500">Account</span>
        <SearchableDropdown
          bind:value={accountName}
          options={accountOptions}
          placeholder="Search accounts..."
        />
      </div>

      <div class="grid grid-cols-2 gap-4">
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
          <label for="qa-rate" class="mb-1 block text-xs font-semibold text-gray-500">Exchange Rate</label>
          <input
            id="qa-rate"
            type="number"
            inputmode="decimal"
            step="0.0001"
            min="0"
            disabled={currencyCode === 'SGD'}
            bind:value={exchangeRateInput}
            class="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
      </div>

      {#if error}
        <p class="text-sm font-medium text-rose-500">{error}</p>
      {/if}
    </div>

    <div
      class="border-t border-gray-100 px-5 pt-4"
      style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);"
    >
      <button
        type="button"
        onclick={handleAdd}
        disabled={isSaving}
        class="w-full rounded-2xl bg-accent-600 py-4 text-base font-bold text-white shadow-sm shadow-accent-200 transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Adding...' : 'Add Transaction'}
      </button>
    </div>
  </div>
{/if}

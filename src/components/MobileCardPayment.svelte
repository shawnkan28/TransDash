<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { resolveAccountType } from '../lib/accounts';
  import { focusOnMount } from '../lib/focus';
  import SearchableDropdown from './SearchableDropdown.svelte';
  import { X } from 'lucide-svelte';

  /**
   * Paying a credit card bill moves money between two accounts, so it is
   * entered as a pair: income on the card (the debt shrinks) and an expense on
   * the savings account it came out of. Both sides use categories that do not
   * affect cash flow, so the payment is not counted as spending twice.
   */
  let { onClose }: { onClose: () => void } = $props();

  const CARD_CATEGORY = 'Credit Card Balance';
  const BANK_CATEGORY = 'Credit Card Payment';

  let bankAccount = $state('');
  let cardAccount = $state('');
  let amountInput = $state('');
  let dateInput = $state(toDateInput(new Date()));
  let isSaving = $state(false);
  let error = $state('');

  function accountsOfType(type: string): string[] {
    return financeStore.accounts
      .filter(
        (account) =>
          !account.disabled &&
          resolveAccountType(account.name, financeStore.accounts, financeStore.transactions) === type
      )
      .map((account) => account.name)
      .sort((a, b) => a.localeCompare(b));
  }

  const bankOptions = $derived(accountsOfType('Savings'));
  const cardOptions = $derived(accountsOfType('Credit Card'));

  // Preselect when there is only one sensible choice; otherwise leave it to the user.
  $effect.pre(() => {
    if (!bankAccount && bankOptions.length === 1) bankAccount = bankOptions[0];
    if (!cardAccount && cardOptions.length === 1) cardAccount = cardOptions[0];
  });

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function toDateInput(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function toDateRaw(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000000+08:00`;
  }

  /** The picked day, at the current time so same-day entries keep their order. */
  function paymentDate(): Date {
    const [year, month, day] = dateInput.split('-').map(Number);
    const date = new Date();
    date.setFullYear(year, month - 1, day);
    return date;
  }

  function close() {
    if (isSaving) return;
    onClose();
  }

  async function handlePay() {
    const value = Number.parseFloat(amountInput);

    if (!bankAccount) {
      error = 'Choose the savings account to pay from.';
      return;
    }
    if (!cardAccount) {
      error = 'Choose the credit card to pay off.';
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      error = 'Enter a valid amount.';
      return;
    }
    if (!dateInput) {
      error = 'Choose a date.';
      return;
    }
    for (const label of [CARD_CATEGORY, BANK_CATEGORY]) {
      if (!financeStore.categories.some((category) => category.label === label)) {
        error = `Add the "${label}" category in Settings first.`;
        return;
      }
    }

    isSaving = true;
    error = '';

    const date = paymentDate();
    const shared = {
      date,
      dateRaw: toDateRaw(date),
      value,
      currencyCode: 'SGD',
      exchangeRate: 1,
      statement: '',
      tripName: '',
    };

    try {
      const cardSide = await financeStore.createTransaction({
        ...shared,
        note: `Pay CC Bill - From ${bankAccount}`,
        category: CARD_CATEGORY,
        accountName: cardAccount,
      });

      try {
        await financeStore.createTransaction({
          ...shared,
          note: `Pay For ${cardAccount}`,
          category: BANK_CATEGORY,
          accountName: bankAccount,
        });
      } catch (err) {
        // Never leave half a payment behind: the card would show as paid
        // while the money never left the bank.
        await financeStore.deleteTransaction(cardSide.id).catch(() => {});
        throw err;
      }

      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save the payment.';
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-surface">
  <div
    class="flex items-center justify-between border-b border-gray-100 px-5 pb-4"
    style="padding-top: calc(env(safe-area-inset-top, 0px) + 1rem);"
  >
    <h2 class="text-lg font-bold text-gray-900">Credit Card Payment</h2>
    <button
      type="button"
      onclick={close}
      class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      aria-label="Close"
    >
      <X size={20} />
    </button>
  </div>

  <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
    <div>
      <span class="mb-1 block text-xs font-semibold text-gray-500">Pay from (savings)</span>
      <SearchableDropdown
        bind:value={bankAccount}
        options={bankOptions}
        placeholder="Search savings accounts..."
      />
      {#if bankOptions.length === 0}
        <p class="mt-1 text-xs text-rose-500">No account has the Savings type yet.</p>
      {/if}
    </div>

    <div>
      <span class="mb-1 block text-xs font-semibold text-gray-500">Credit card to pay off</span>
      <SearchableDropdown
        bind:value={cardAccount}
        options={cardOptions}
        placeholder="Search credit cards..."
      />
      {#if cardOptions.length === 0}
        <p class="mt-1 text-xs text-rose-500">No account has the Credit Card type yet.</p>
      {/if}
    </div>

    <div>
      <label for="cc-amount" class="mb-1 block text-xs font-semibold text-gray-500">Amount</label>
      <div class="relative">
        <span
          class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400"
        >
          $
        </span>
        <input
          id="cc-amount"
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
      <label for="cc-date" class="mb-1 block text-xs font-semibold text-gray-500">Date</label>
      <input
        id="cc-date"
        type="date"
        bind:value={dateInput}
        class="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
    </div>

    {#if bankAccount && cardAccount}
      <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-600">
        <p class="mb-2 font-semibold text-gray-500">This adds two entries</p>
        <p>
          <span class="font-bold text-emerald-600">+</span>
          {cardAccount} · {CARD_CATEGORY} · "Pay CC Bill - From {bankAccount}"
        </p>
        <p class="mt-1">
          <span class="font-bold text-rose-500">−</span>
          {bankAccount} · {BANK_CATEGORY} · "Pay For {cardAccount}"
        </p>
      </div>
    {/if}

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
      onclick={handlePay}
      disabled={isSaving}
      class="w-full rounded-2xl bg-accent-600 py-4 text-base font-bold text-white shadow-sm shadow-accent-200 transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSaving ? 'Saving...' : 'Add Payment'}
    </button>
  </div>
</div>

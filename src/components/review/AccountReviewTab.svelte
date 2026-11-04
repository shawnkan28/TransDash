<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { currencyFormatter as formatter } from '../../lib/formatters';
  import {
    buildReviewScopes,
    inScope,
    scopeCurrency,
    type ReviewScope,
  } from '../../lib/reviewScope';
  import { formatDayMonthYear } from '../../lib/dateFormat';
  import { computeEndBalance, resolveAccountType } from '../../lib/accounts';
  import {
    checkEndBalance,
    startBalanceKey,
    type StatementBalances,
  } from '../../lib/startBalances';
  import { compareStatements, isUnassignedStatement } from '../../lib/statement';
  import SearchableDropdown from '../SearchableDropdown.svelte';
  import { formatCurrency } from '../../lib/formatters';
  import { ChevronRight, ArrowLeft, Check, TriangleAlert, Save, Pencil, Trash2, Plus } from 'lucide-svelte';
  import type { Transaction } from '../../lib/types';

  /**
   * One account at a time, start to finish: assign the statement to what is
   * unassigned, then check the computed end balance against the paper one.
   *
   * The pieces used to live in two different tabs, so reconciling one account
   * meant moving back and forth between them.
   */
  let {
    transactions,
    balances = $bindable(),
    pendingStatements = $bindable(),
    statementOptions,
    isSaving = false,
    saveError = '',
    onSave,
    onEdit,
    onCreate,
    onDelete,
    deletingId = null,
  }: {
    /** Transactions with any unsaved statement assignments already applied. */
    transactions: Transaction[];
    balances: StatementBalances;
    pendingStatements: Record<string, string>;
    statementOptions: string[];
    isSaving?: boolean;
    saveError?: string;
    onSave: () => void;
    /** Opens the shared edit modal for a row that was entered wrongly. */
    onEdit: (transaction: Transaction) => void;
    /** Opens the shared modal for an entry missing from the data, prefilled for this account. */
    onCreate: (defaults: { accountName: string; currencyCode: string; statement: string }) => void;
    onDelete: (transaction: Transaction) => void;
    deletingId?: string | null;
  } = $props();

  let selectedScopeId = $state<string | null>(null);
  let targetStatement = $state('');

  const accountType = (name: string) =>
    resolveAccountType(name, financeStore.accounts, financeStore.transactions);

  const scopes = $derived(buildReviewScopes(transactions));

  const selectedScope = $derived(
    scopes.find((scope) => scope.id === selectedScopeId) ?? null
  );

  /** Every scope with how much is left to review in it. */
  const scopeRows = $derived(
    scopes
      .map((scope) => {
        const rows = transactions.filter((transaction) => inScope(transaction, scope));
        return {
          scope,
          type: accountType(scope.accountName),
          currency: scopeCurrency(scope, transactions),
          total: rows.length,
          unassigned: rows.filter((row) => isUnassignedStatement(row.statement)).length,
        };
      })
      // Work outstanding first; the rest alphabetically.
      .sort((a, b) => b.unassigned - a.unassigned || a.scope.label.localeCompare(b.scope.label))
  );

  const totalUnassigned = $derived(
    scopeRows.reduce((sum, row) => sum + row.unassigned, 0)
  );

  /** Everything in this scope settles in one currency, so nothing is converted. */
  const currency = $derived(
    selectedScope ? scopeCurrency(selectedScope, transactions) : 'SGD'
  );

  const money = $derived(
    (value: number) =>
      currency === 'SGD' ? formatter.format(value) : formatCurrency(value, currency)
  );

  /** Statements this account already uses, newest first, for the period picker. */
  const accountStatements = $derived.by(() => {
    if (!selectedScope) return [];
    const seen = new Set<string>();
    for (const transaction of transactions) {
      if (!inScope(transaction, selectedScope)) continue;
      if (isUnassignedStatement(transaction.statement)) continue;
      seen.add(transaction.statement.trim());
    }
    return Array.from(seen).sort(compareStatements).reverse();
  });

  const periodOptions = $derived(
    Array.from(new Set([...accountStatements, ...statementOptions]))
  );

  /**
   * Taken from the saved data, not the pending-applied copy, so a row stays
   * put once you pick its statement. Filtering on the pending value made rows
   * vanish from the list the moment they were assigned, which left no way to
   * see or correct the choice before saving.
   */
  const unassigned = $derived(
    !selectedScope
      ? []
      : financeStore.transactions
          .filter(
            (transaction) =>
              inScope(transaction, selectedScope) &&
              isUnassignedStatement(transaction.statement)
          )
          .sort((a, b) => a.date.getTime() - b.date.getTime())
  );

  /** Rows still without a statement, pending edits included — what is left to do. */
  const remaining = $derived(
    unassigned.filter((transaction) => !pendingStatements[transaction.id])
  );

  /** What the balance below is actually computed from. */
  const inPeriod = $derived(
    !selectedScope || !targetStatement
      ? []
      : transactions
          .filter(
            (transaction) =>
              inScope(transaction, selectedScope) &&
              transaction.statement.trim() === targetStatement
          )
          .sort((a, b) => a.date.getTime() - b.date.getTime())
  );

  const income = $derived(
    inPeriod
      .filter((transaction) => transaction.transactionType === 'Income')
      .reduce((sum, transaction) => sum + transaction.value, 0)
  );

  const expenses = $derived(
    inPeriod
      .filter((transaction) => transaction.transactionType === 'Expense')
      .reduce((sum, transaction) => sum + transaction.value, 0)
  );

  // Keyed on the scope id, so each currency of a wallet keeps its own balance.
  const balanceKey = $derived(
    selectedScope && targetStatement ? startBalanceKey(targetStatement, selectedScope.id) : ''
  );

  const startBalance = $derived(balances.start[balanceKey] ?? '');
  const savedEndBalance = $derived(balances.end[balanceKey] ?? '');

  const computedEnd = $derived(
    !selectedScope || !targetStatement
      ? 0
      : computeEndBalance(
          accountType(selectedScope.accountName),
          Number.parseFloat(startBalance) || 0,
          income,
          expenses
        )
  );

  const balanceCheck = $derived(checkEndBalance(computedEnd, savedEndBalance));


  function openScope(scope: ReviewScope) {
    selectedScopeId = scope.id;
    // Default to the newest statement this account already uses, which is
    // almost always the one being reconciled.
    targetStatement = accountStatements[0] ?? statementOptions[0] ?? '';
  }

  function setBalance(field: 'start' | 'end', value: string) {
    if (!balanceKey) return;
    balances = { ...balances, [field]: { ...balances[field], [balanceKey]: value } };
  }

  function setStatement(transactionId: string, statement: string) {
    if (!statement.trim()) {
      const { [transactionId]: _dropped, ...rest } = pendingStatements;
      pendingStatements = rest;
      return;
    }
    pendingStatements = { ...pendingStatements, [transactionId]: statement };
  }

  function assignAllToPeriod() {
    if (!targetStatement || remaining.length === 0) return;
    const next = { ...pendingStatements };
    for (const transaction of remaining) next[transaction.id] = targetStatement;
    pendingStatements = next;
  }

  /** The amount exactly as entered — the figure printed on the statement. */
  function sourceAmount(transaction: Transaction): string {
    const sign = transaction.transactionType === 'Income' ? '+' : '-';
    return `${sign}${money(Math.abs(transaction.value))}`;
  }
</script>

{#if selectedScope === null}
  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="border-b border-gray-50 px-6 py-4">
      <h2 class="text-lg font-bold text-gray-900">Accounts</h2>
      <p class="mt-1 text-sm text-gray-500">
        {#if totalUnassigned > 0}
          {totalUnassigned} transaction{totalUnassigned === 1 ? '' : 's'} still to assign.
          Pick the account whose statement you have open. A wallet holding several
          currencies is listed once per currency, since each settles separately.
        {:else}
          Every transaction has a statement. Pick an account to check its balances.
        {/if}
      </p>
    </div>

    <ul class="divide-y divide-gray-50">
      {#each scopeRows as row (row.scope.id)}
        <li>
          <button
            type="button"
            onclick={() => openScope(row.scope)}
            class="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50/70"
          >
            <div class="min-w-0">
              <p class="text-[15px] font-bold text-gray-900">
                {row.scope.accountName}
                {#if row.scope.currency}
                  <span class="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                    {row.scope.currency}
                  </span>
                {/if}
              </p>
              <p class="text-xs text-gray-500">{row.type} · {row.total} transactions</p>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              {#if row.unassigned > 0}
                <span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                  {row.unassigned} to assign
                </span>
              {:else}
                <span class="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <Check size={14} /> all assigned
                </span>
              {/if}
              <ChevronRight size={18} class="text-gray-300" />
            </div>
          </button>
        </li>
      {/each}
      {#if scopeRows.length === 0}
        <li class="px-6 py-12 text-center text-sm text-gray-500">No transactions yet.</li>
      {/if}
    </ul>
  </div>
{:else}
  <div class="space-y-4">
    <div class="flex flex-col gap-4 rounded-[20px] border border-gray-100 bg-surface p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={() => (selectedScopeId = null)}
          class="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          Accounts
        </button>
        <div>
          <h2 class="text-lg font-bold text-gray-900">{selectedScope.label}</h2>
          <p class="text-xs text-gray-500">
            {accountType(selectedScope.accountName)}
            {#if selectedScope.currency}
              · balances in {selectedScope.currency}
            {/if}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="shrink-0 text-sm font-semibold text-gray-500">Reviewing</span>
        <SearchableDropdown
          bind:value={targetStatement}
          clearable={false}
          options={periodOptions}
          placeholder="Sep-26"
          class="w-40"
        />
        <button
          type="button"
          onclick={() =>
            onCreate({
              accountName: selectedScope.accountName,
              currencyCode: currency,
              statement: targetStatement,
            })}
          class="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Plus size={16} />
          New Entry
        </button>
      </div>
    </div>

    <!-- Step 1: give the unassigned rows a statement. -->
    <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div class="flex flex-col gap-3 border-b border-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-[15px] font-bold text-gray-900">
            To assign ({remaining.length}{#if remaining.length !== unassigned.length}
              of {unassigned.length}{/if})
          </h3>
          <p class="mt-0.5 text-xs text-gray-500">
            Tick these off against the statement you have open.
            {#if remaining.length !== unassigned.length}
              <span class="font-semibold text-accent-600">
                {unassigned.length - remaining.length} ready to save.
              </span>
            {/if}
          </p>
        </div>
        {#if remaining.length > 0 && targetStatement}
          <button
            type="button"
            onclick={assignAllToPeriod}
            class="shrink-0 rounded-xl border border-accent-200 bg-accent-50 px-4 py-2 text-sm font-bold text-accent-700 transition-colors hover:bg-accent-100"
          >
            Assign all to {targetStatement}
          </button>
        {/if}
      </div>

      {#if unassigned.length === 0}
        <p class="px-6 py-10 text-center text-sm text-gray-500">
          Nothing left to assign for this account.
        </p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr class="bg-gray-50/95 text-[13px] text-gray-500">
                <th class="px-6 py-3 font-semibold">Date</th>
                <th class="px-6 py-3 font-semibold">Note</th>
                <th class="px-6 py-3 font-semibold">Category</th>
                <th class="px-6 py-3 text-right font-semibold">Amount</th>
                <th class="px-6 py-3 font-semibold">Statement</th>
                <th class="px-6 py-3 text-right font-semibold">Fix</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              {#each unassigned as transaction (transaction.id)}
                {@const assigned = Boolean(pendingStatements[transaction.id])}
                <tr class="transition-colors hover:bg-gray-50/50 {assigned ? 'bg-accent-50/40' : ''}">
                  <td class="px-6 py-3 text-[13px] font-medium text-gray-600">
                    {formatDayMonthYear(transaction.date)}
                  </td>
                  <td class="px-6 py-3 text-[14px] font-bold text-gray-900">{transaction.note}</td>
                  <td class="px-6 py-3 text-[13px] text-gray-600">{transaction.category}</td>
                  <td
                    class="px-6 py-3 text-right text-[14px] font-bold {transaction.transactionType === 'Income'
                      ? 'text-emerald-500'
                      : 'text-rose-500'}"
                  >
                    {sourceAmount(transaction)}
                  </td>
                  <td class="px-6 py-3">
                    <SearchableDropdown
                      value={pendingStatements[transaction.id] ?? ''}
                      options={periodOptions}
                      placeholder="Unassigned"
                      class="min-w-[140px]"
                      onchange={(statement) => setStatement(transaction.id, statement)}
                    />
                  </td>
                  <td class="px-6 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onclick={() => onEdit(transaction)}
                      aria-label="Edit entry"
                      class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-accent-50 hover:text-accent-600"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onclick={() => onDelete(transaction)}
                      disabled={deletingId === transaction.id}
                      aria-label="Delete entry"
                      class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Step 2: what the balance is computed from. -->
    <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div class="border-b border-gray-50 px-6 py-4">
        <h3 class="text-[15px] font-bold text-gray-900">
          In {targetStatement || 'this statement'} ({inPeriod.length})
        </h3>
        <p class="mt-0.5 text-xs text-gray-500">
          These are what the computed balance below adds up.
        </p>
      </div>

      {#if inPeriod.length === 0}
        <p class="px-6 py-10 text-center text-sm text-gray-500">
          Nothing assigned to this statement yet.
        </p>
      {:else}
        <div class="max-h-80 overflow-y-auto">
          <table class="w-full min-w-[520px] border-collapse text-left">
            <tbody class="divide-y divide-gray-50">
              {#each inPeriod as transaction (transaction.id)}
                <tr>
                  <td class="px-6 py-2.5 text-[13px] font-medium text-gray-600">
                    {formatDayMonthYear(transaction.date)}
                  </td>
                  <td class="px-6 py-2.5 text-[14px] text-gray-900">{transaction.note}</td>
                  <td
                    class="px-6 py-2.5 text-right text-[14px] font-bold {transaction.transactionType === 'Income'
                      ? 'text-emerald-500'
                      : 'text-rose-500'}"
                  >
                    {sourceAmount(transaction)}
                  </td>
                  <td class="px-6 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onclick={() => onEdit(transaction)}
                      aria-label="Edit entry"
                      class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-accent-50 hover:text-accent-600"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onclick={() => onDelete(transaction)}
                      disabled={deletingId === transaction.id}
                      aria-label="Delete entry"
                      class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Step 3: does it agree with the paper statement? -->
    <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div class="border-b border-gray-50 px-6 py-4">
        <h3 class="text-[15px] font-bold text-gray-900">Balance check</h3>
        <p class="mt-0.5 text-xs text-gray-500">
          Type the two figures from the statement.
          {#if selectedScope.currency}
            Every figure here is in
            <span class="font-semibold">{selectedScope.currency}</span>, exactly as entered.
          {/if}
        </p>
      </div>

      <div class="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label for="acct-start" class="mb-1 block text-xs font-semibold text-gray-500">
            Start balance{selectedScope.currency ? ` (${selectedScope.currency})` : ''}
          </label>
          <input
            id="acct-start"
            type="number"
            step="0.01"
            value={startBalance}
            placeholder="0.00"
            disabled={!balanceKey}
            oninput={(event) => setBalance('start', (event.currentTarget as HTMLInputElement).value)}
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:bg-gray-50"
          />
        </div>

        <div class="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
          <p class="text-xs font-semibold text-gray-500">In · Out</p>
          <p class="mt-1 text-sm font-bold text-emerald-500">{money(income)}</p>
          <p class="text-sm font-bold text-rose-500">{money(expenses)}</p>
        </div>

        <div class="rounded-xl border border-accent-100 bg-accent-50/60 p-3">
          <p class="text-xs font-semibold text-accent-700">Computed end balance</p>
          <p class="mt-1 text-xl font-bold text-gray-900">{money(computedEnd)}</p>
        </div>

        <div>
          <label for="acct-end" class="mb-1 block text-xs font-semibold text-gray-500">
            End balance{selectedScope.currency ? ` (${selectedScope.currency})` : ''}
          </label>
          <input
            id="acct-end"
            type="number"
            step="0.01"
            value={savedEndBalance}
            placeholder="0.00"
            disabled={!balanceKey}
            oninput={(event) => setBalance('end', (event.currentTarget as HTMLInputElement).value)}
            class="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 disabled:bg-gray-50
                   {balanceCheck.status === 'mismatch'
              ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
              : 'border-gray-200 focus:border-accent-300 focus:ring-accent-100'}"
          />
        </div>
      </div>

      <div class="flex flex-col gap-3 border-t border-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        {#if balanceCheck.status === 'match'}
          <p class="flex items-center gap-2 text-sm font-bold text-emerald-600">
            <Check size={16} /> Matches the statement
          </p>
        {:else if balanceCheck.status === 'mismatch'}
          <p class="flex items-center gap-2 text-sm font-bold text-rose-500">
            <TriangleAlert size={16} />
            Off by {money(Math.abs(balanceCheck.difference))}
          </p>
        {:else}
          <p class="text-sm text-gray-500">Enter the statement's end balance to check it.</p>
        {/if}

        <button
          type="button"
          onclick={onSave}
          disabled={isSaving}
          class="flex shrink-0 items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-accent-500 disabled:opacity-50"
        >
          <Save size={16} />
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {#if saveError}
        <p class="px-6 pb-4 text-sm font-semibold text-rose-500">{saveError}</p>
      {/if}
    </div>
  </div>
{/if}

<script lang="ts">
  import { onMount } from 'svelte';
  import { financeStore } from '../lib/store.svelte';
  import { currencyFormatter as formatter } from '../lib/formatters';
  import { transactionValueInSGD } from '../lib/currency';
  import { formatDayMonthYear } from '../lib/dateFormat';
  import { loadStatementBalancesCsv, saveStatementBalancesCsv } from '../lib/startBalancesCsv';
  import {
    checkEndBalance,
    emptyStatementBalances,
    serializeStatementBalances,
    startBalanceKey as buildBalanceKey,
    type BalanceCheckStatus,
    type StatementBalances,
  } from '../lib/startBalances';
  import { matchesAmountSearch, matchesSearchPattern } from '../lib/search';
  import {
    collectStatementOptions,
    compareStatements,
    isUnassignedStatement,
    uniqueAssignedStatements,
  } from '../lib/statement';
  import { computeEndBalance, resolveAccountType } from '../lib/accounts';
  import AccountReviewTab from './review/AccountReviewTab.svelte';
  import { buildReviewScopes, inScope, scopeCurrency } from '../lib/reviewScope';
  import SearchableSelect from './SearchableSelect.svelte';
  import SearchableDropdown from './SearchableDropdown.svelte';
  import TransactionEditModal from './TransactionEditModal.svelte';
  import {
    Save,
    Search,
    Pencil,
    Plus,
    ChevronRight,
    Trash2,
    AlertTriangle,
    CheckCircle2,
  } from 'lucide-svelte';
  import type { Transaction } from '../lib/types';

  type TransactionModalMode = 'closed' | 'edit' | 'create';
  type CreateDefaults = { accountName?: string; currencyCode?: string; statement?: string };

  let statementFilter = $state('All');
  let accountFilter = $state('All');
  let reviewAccountFilter = $state('All');
  let reviewSearchQuery = $state('');
  let currentPage = $state(1);
  let reviewPage = $state(1);
  let activeTab = $state<'accounts' | 'review' | 'view' | 'summary'>('accounts');
  let summaryStatement = $state('');
  let summaryAccount = $state('');
  let balances = $state<StatementBalances>(emptyStatementBalances());
  let savedBalances = $state<StatementBalances>(emptyStatementBalances());
  let isSavingBalances = $state(false);
  let balanceSaveError = $state('');
  let mismatchesOnly = $state(false);
  let pendingStatements = $state<Record<string, string>>({});
  let isSavingStatements = $state(false);
  let saveError = $state('');
  let editingTransaction = $state<Transaction | null>(null);
  let transactionModalMode = $state<TransactionModalMode>('closed');
  let createDefaults = $state<CreateDefaults>({});
  let expandedSummaryAccounts = $state<Record<string, boolean>>({});
  let summaryStatementSearch = $state('');
  let deletingTransactionId = $state<string | null>(null);
  const itemsPerPage = 10;

  const effectiveTransactions = $derived.by(() =>
    financeStore.transactions.map((transaction) => ({
      ...transaction,
      statement: pendingStatements[transaction.id] ?? transaction.statement,
    }))
  );

  const hasPendingStatements = $derived(Object.keys(pendingStatements).length > 0);

  const hasPendingBalances = $derived(
    serializeStatementBalances(balances) !== serializeStatementBalances(savedBalances)
  );

  onMount(async () => {
    const loaded = await loadStatementBalancesCsv();
    balances = loaded;
    savedBalances = structuredClone(loaded);
  });

  const unassignedTransactions = $derived(
    financeStore.transactions.filter((transaction) => isUnassignedStatement(transaction.statement))
  );

  const reviewAccountOptions = $derived.by(() => {
    const accounts = new Set(
      unassignedTransactions.map((transaction) => transaction.accountName).filter(Boolean)
    );

    return ['All', ...Array.from(accounts).sort((a, b) => a.localeCompare(b))];
  });

  const filteredUnassignedTransactions = $derived.by(() => {
    let result =
      reviewAccountFilter === 'All'
        ? unassignedTransactions
        : unassignedTransactions.filter(
            (transaction) => transaction.accountName === reviewAccountFilter
          );

    const query = reviewSearchQuery.trim().toLowerCase();
    if (!query) return result;

    return result.filter(
      (transaction) =>
        transaction.note.toLowerCase().includes(query) ||
        matchesAmountSearch(query, transactionValueInSGD(transaction), transaction.value)
    );
  });

  const reviewTotalPages = $derived(
    Math.ceil(filteredUnassignedTransactions.length / itemsPerPage) || 1
  );

  const paginatedUnassignedTransactions = $derived.by(() => {
    const start = (reviewPage - 1) * itemsPerPage;
    return filteredUnassignedTransactions.slice(start, start + itemsPerPage);
  });

  const assignedStatements = $derived(uniqueAssignedStatements(effectiveTransactions));

  const statementOptions = $derived.by(() => {
    const base = collectStatementOptions(financeStore.transactions);
    const custom = financeStore.statements.map((statement) => statement.value);
    return Array.from(new Set([...base, ...custom])).sort(compareStatements);
  });

  const assignedTransactions = $derived(
    financeStore.transactions.filter((transaction) => !isUnassignedStatement(transaction.statement))
  );

  const statementFilterOptions = $derived(['All', ...assignedStatements]);

  const viewAccountOptions = $derived.by(() => {
    const base =
      statementFilter === 'All'
        ? assignedTransactions
        : assignedTransactions.filter(
            (transaction) => transaction.statement.trim() === statementFilter
          );

    const accounts = new Set(
      base.map((transaction) => transaction.accountName).filter(Boolean)
    );

    return ['All', ...Array.from(accounts).sort((a, b) => a.localeCompare(b))];
  });

  const filteredTransactions = $derived.by(() => {
    return assignedTransactions.filter((transaction) => {
      if (statementFilter !== 'All' && transaction.statement.trim() !== statementFilter) {
        return false;
      }

      if (accountFilter !== 'All' && transaction.accountName !== accountFilter) {
        return false;
      }

      return true;
    });
  });

  const totalPages = $derived(Math.ceil(filteredTransactions.length / itemsPerPage) || 1);

  const paginatedTransactions = $derived.by(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  });

  const summaryAccountOptions = $derived.by(() => {
    if (!summaryStatement) return [];

    const accounts = new Set(
      effectiveTransactions
        .filter((transaction) => transaction.statement.trim() === summaryStatement)
        .map((transaction) => transaction.accountName)
        .filter(Boolean)
    );

    return Array.from(accounts).sort((a, b) => a.localeCompare(b));
  });

  const summaryTransactions = $derived.by(() => {
    if (!summaryStatement || !summaryAccount) return [];

    return effectiveTransactions.filter(
      (transaction) =>
        transaction.statement.trim() === summaryStatement &&
        transaction.accountName === summaryAccount
    );
  });

  const summaryIncome = $derived(
    summaryTransactions
      .filter((transaction) => transaction.transactionType === 'Income')
      .reduce((total, transaction) => total + transactionValueInSGD(transaction), 0)
  );

  const summaryExpenses = $derived(
    summaryTransactions
      .filter((transaction) => transaction.transactionType === 'Expense')
      .reduce((total, transaction) => total + transactionValueInSGD(transaction), 0)
  );

  const startBalanceKey = $derived(buildBalanceKey(summaryStatement, summaryAccount));

  const startBalance = $derived(balances.start[startBalanceKey] ?? '');

  const savedEndBalance = $derived(balances.end[startBalanceKey] ?? '');

  const summaryStartBalance = $derived(Number.parseFloat(startBalance) || 0);

  const summaryEndBalance = $derived.by(() => {
    if (!summaryStatement || !summaryAccount) return 0;

    const accountType = resolveAccountType(
      summaryAccount,
      financeStore.accounts,
      financeStore.transactions
    );

    return computeEndBalance(
      accountType,
      summaryStartBalance,
      summaryIncome,
      summaryExpenses
    );
  });

  const summaryBalanceCheck = $derived(checkEndBalance(summaryEndBalance, savedEndBalance));

  /**
   * Grouped by review scope, not bare account, so a multi-currency wallet gets
   * one section per currency — matching how its balances are keyed and how the
   * statements actually settle. Amounts are the entered ones: a scope only ever
   * holds one currency, so there is nothing to convert.
   */
  const summaryGroups = $derived.by(() => {
    balances;

    return buildReviewScopes(effectiveTransactions)
      .map((scope) => {
        const scoped = effectiveTransactions.filter(
          (transaction) =>
            inScope(transaction, scope) && !isUnassignedStatement(transaction.statement)
        );

        const accountType = resolveAccountType(
          scope.accountName,
          financeStore.accounts,
          financeStore.transactions
        );

        const statements = Array.from(
          new Set(scoped.map((transaction) => transaction.statement.trim()))
        ).sort(compareStatements);

        const rows = statements.map((statement) => {
          const forStatement = scoped.filter(
            (transaction) => transaction.statement.trim() === statement
          );

          const income = forStatement
            .filter((transaction) => transaction.transactionType === 'Income')
            .reduce((sum, transaction) => sum + transaction.value, 0);

          const expenses = forStatement
            .filter((transaction) => transaction.transactionType === 'Expense')
            .reduce((sum, transaction) => sum + transaction.value, 0);

          const key = buildBalanceKey(statement, scope.id);
          const startBalance = Number.parseFloat(balances.start[key] ?? '') || 0;
          const endBalance = computeEndBalance(accountType, startBalance, income, expenses);

          return {
            statement,
            startBalance,
            endBalance,
            ...checkEndBalance(endBalance, balances.end[key]),
          };
        });

        return {
          accountName: scope.label,
          accountType,
          currency: scopeCurrency(scope, effectiveTransactions),
          rows,
          mismatchCount: rows.filter((row) => row.status === 'mismatch').length,
        };
      })
      .filter((group) => group.rows.length > 0);
  });

  const totalMismatchCount = $derived(
    summaryGroups.reduce((total, group) => total + group.mismatchCount, 0)
  );

  const filteredSummaryGroups = $derived.by(() => {
    const query = summaryStatementSearch.trim();

    return summaryGroups
      .map((group) => {
        const rows = group.rows.filter(
          (row) =>
            (!query || matchesSearchPattern(row.statement, query)) &&
            (!mismatchesOnly || row.status === 'mismatch')
        );
        return { ...group, rows };
      })
      .filter((group) => group.rows.length > 0);
  });

  $effect(() => {
    statementFilter;
    accountFilter;
    currentPage = 1;
  });

  $effect(() => {
    if (!reviewAccountOptions.includes(reviewAccountFilter)) {
      reviewAccountFilter = 'All';
    }
  });

  $effect(() => {
    reviewAccountFilter;
    reviewSearchQuery;
    reviewPage = 1;
  });

  $effect(() => {
    if (reviewPage > reviewTotalPages) {
      reviewPage = reviewTotalPages;
    }
  });

  $effect(() => {
    statementFilter;
    if (!viewAccountOptions.includes(accountFilter)) {
      accountFilter = 'All';
    }
  });

  $effect(() => {
    if (!summaryStatement && assignedStatements.length > 0) {
      summaryStatement = assignedStatements[assignedStatements.length - 1];
    }
  });

  $effect(() => {
    summaryStatement;
    if (!summaryAccountOptions.includes(summaryAccount)) {
      summaryAccount = summaryAccountOptions[0] ?? '';
    }
  });

  function updatePendingStatement(transactionId: string, statement: string) {
    if (!statement.trim()) {
      const { [transactionId]: _removed, ...rest } = pendingStatements;
      pendingStatements = rest;
      return;
    }

    pendingStatements = { ...pendingStatements, [transactionId]: statement };
  }

  async function savePendingStatements() {
    if (!hasPendingStatements) return;

    isSavingStatements = true;
    saveError = '';

    try {
      await financeStore.updateTransactionStatements(pendingStatements);
      pendingStatements = {};
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Failed to save statements.';
    } finally {
      isSavingStatements = false;
    }
  }

  /**
   * The account workspace has one Save: assignments and balances are two
   * halves of reconciling the same statement, so they commit together.
   */
  async function saveAccountReview() {
    if (hasPendingStatements) await savePendingStatements();
    if (hasPendingBalances) await saveBalances();
  }

  async function saveBalances() {
    if (!hasPendingBalances) return;

    isSavingBalances = true;
    balanceSaveError = '';

    try {
      await saveStatementBalancesCsv(balances);
      savedBalances = $state.snapshot(balances);
      alert('Balances saved.');
    } catch (error) {
      balanceSaveError = error instanceof Error ? error.message : 'Failed to save balances.';
    } finally {
      isSavingBalances = false;
    }
  }

  function formatStatementLabel(value: string) {
    if (value === 'All') return 'All statements';
    return value;
  }

  function formatAccountLabel(value: string) {
    if (value === 'All') return 'All accounts';
    return value;
  }

  function openEditModal(transaction: Transaction) {
    editingTransaction = transaction;
    transactionModalMode = 'edit';
  }

  function openCreateModal(defaults: CreateDefaults = {}) {
    editingTransaction = null;
    createDefaults = defaults;
    transactionModalMode = 'create';
  }

  function closeEditModal() {
    editingTransaction = null;
    transactionModalMode = 'closed';
  }

  function handleTransactionSaved() {
    if (!editingTransaction) return;

    const { [editingTransaction.id]: _removed, ...rest } = pendingStatements;
    pendingStatements = rest;
  }

  async function deleteEntry(transaction: Transaction) {
    const confirmed = confirm(
      `Delete "${transaction.note}"?\n\nThis permanently removes the entry. It cannot be undone.`
    );
    if (!confirmed) return;

    deletingTransactionId = transaction.id;

    try {
      await financeStore.deleteTransaction(transaction.id);

      if (transaction.id in pendingStatements) {
        const { [transaction.id]: _removed, ...rest } = pendingStatements;
        pendingStatements = rest;
      }

      if (editingTransaction?.id === transaction.id) {
        closeEditModal();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete entry.');
    } finally {
      deletingTransactionId = null;
    }
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
    }
  }

  function goToReviewPage(page: number) {
    if (page >= 1 && page <= reviewTotalPages) {
      reviewPage = page;
    }
  }

  function setBalance(field: 'start' | 'end', key: string, value: string) {
    balances = { ...balances, [field]: { ...balances[field], [key]: value } };
  }

  function handleBalanceInput(field: 'start' | 'end', key: string, event: Event) {
    setBalance(field, key, (event.currentTarget as HTMLInputElement).value);
  }

  function balanceStatusLabel(status: BalanceCheckStatus, difference: number): string {
    if (status === 'missing') return 'Not saved';
    if (status === 'match') return 'Matched';
    return `Off by ${formatter.format(Math.abs(difference))}`;
  }

  function toggleSummaryAccount(accountName: string) {
    expandedSummaryAccounts = {
      ...expandedSummaryAccounts,
      [accountName]: !expandedSummaryAccounts[accountName],
    };
  }

  /** Mismatch filtering keeps every remaining row visible without extra clicks. */
  function isSummaryAccountExpanded(accountName: string): boolean {
    return mismatchesOnly || Boolean(expandedSummaryAccounts[accountName]);
  }
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="text-[28px] font-bold tracking-tight text-gray-900">Review</h1>
      <p class="text-sm text-gray-500">
        Assign and manage transaction statements in <span class="font-semibold text-gray-700">Mmm-YY</span>
        format, for example Apr-26 or Dec-22.
      </p>
    </div>

    <div class="flex items-center self-start rounded-xl border border-gray-200 bg-gray-50 p-1">
      <button
        type="button"
        onclick={() => (activeTab = 'accounts')}
        class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer
               {activeTab === 'accounts'
          ? 'bg-surface text-accent-600 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        By Account
        {#if unassignedTransactions.length > 0}
          <span class="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-bold text-accent-700">
            {unassignedTransactions.length}
          </span>
        {/if}
      </button>
      <button
        type="button"
        onclick={() => (activeTab = 'review')}
        class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer
               {activeTab === 'review'
          ? 'bg-surface text-accent-600 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        All Unassigned
      </button>
      <button
        type="button"
        onclick={() => (activeTab = 'view')}
        class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer
               {activeTab === 'view'
          ? 'bg-surface text-accent-600 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        View Statement
      </button>
      <button
        type="button"
        onclick={() => (activeTab = 'summary')}
        class="rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer
               {activeTab === 'summary'
          ? 'bg-surface text-accent-600 shadow-sm'
          : 'text-gray-600 hover:text-gray-900'}"
      >
        View Summary
      </button>
    </div>
  </div>

  {#if activeTab === 'accounts'}
    <AccountReviewTab
      transactions={effectiveTransactions}
      bind:balances
      bind:pendingStatements
      {statementOptions}
      isSaving={isSavingStatements || isSavingBalances}
      saveError={saveError || balanceSaveError}
      onSave={saveAccountReview}
      onEdit={openEditModal}
      onCreate={openCreateModal}
      onDelete={deleteEntry}
      deletingId={deletingTransactionId}
    />
  {:else if activeTab === 'review'}
  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="border-b border-gray-50 px-6 py-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-bold text-gray-900">Review Statement</h2>
          <p class="text-sm text-gray-500">
            Assign statements to entries missing one. Changes are previewed until you save.
          </p>
          {#if saveError}
            <p class="mt-2 text-sm font-medium text-rose-500">{saveError}</p>
          {/if}
        </div>
        <div class="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onclick={() => openCreateModal()}
            class="flex items-center gap-2 rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Plus size={16} />
            New Entry
          </button>
          <button
            type="button"
            onclick={savePendingStatements}
            disabled={!hasPendingStatements || isSavingStatements}
            class="flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors
                   disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} />
            {isSavingStatements ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative w-full sm:w-64">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            bind:value={reviewSearchQuery}
            placeholder="Search notes or amount..."
            class="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <SearchableDropdown
          bind:value={reviewAccountFilter}
          clearable={false}
          options={reviewAccountOptions}
          formatLabel={formatAccountLabel}
          placeholder="Search accounts..."
          class="w-full sm:w-56"
        />
      </div>
    </div>
    <div class="overflow-x-auto">
      <table class="min-w-[980px] w-full border-collapse text-left">
        <thead>
          <tr class="bg-gray-50/95 text-[13px] text-gray-500">
            <th class="px-6 py-4 font-semibold">Date</th>
            <th class="px-6 py-4 font-semibold">Notes</th>
            <th class="px-6 py-4 font-semibold">Category</th>
            <th class="px-6 py-4 font-semibold">Account</th>
            <th class="px-6 py-4 font-semibold">Amount</th>
            <th class="px-6 py-4 font-semibold">Statement</th>
            <th class="px-6 py-4 font-semibold w-24"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          {#each paginatedUnassignedTransactions as transaction (transaction.id)}
            <tr class="transition-colors hover:bg-gray-50/50">
              <td class="px-6 py-4 text-[13px] font-medium text-gray-600">
                {formatDayMonthYear(transaction.date)}
              </td>
              <td class="px-6 py-4">
                <span class="text-[14px] font-bold text-gray-900">{transaction.note}</span>
              </td>
              <td class="px-6 py-4 text-[13px] font-medium text-gray-600">{transaction.category}</td>
              <td class="px-6 py-4 text-[13px] font-medium text-gray-600">{transaction.accountName}</td>
              <td
                class="px-6 py-4 text-[14px] font-bold {transaction.transactionType === 'Expense'
                  ? 'text-rose-500'
                  : 'text-emerald-500'}"
              >
                {transaction.transactionType === 'Expense' ? '-' : '+'}
                {formatter.format(transactionValueInSGD(transaction))}
              </td>
              <td class="px-6 py-4">
                <SearchableDropdown
                  value={pendingStatements[transaction.id] ?? ''}
                  options={statementOptions}
                  placeholder="Apr-26"
                  class="min-w-[140px]"
                  onchange={(statement) => updatePendingStatement(transaction.id, statement)}
                />
              </td>
              <td class="px-6 py-4 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onclick={() => openEditModal(transaction)}
                    class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-accent-600"
                    aria-label="Edit entry"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onclick={() => deleteEntry(transaction)}
                    disabled={deletingTransactionId === transaction.id}
                    class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Delete entry"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                {#if unassignedTransactions.length === 0}
                  All entries have a statement assigned.
                {:else if reviewSearchQuery.trim()}
                  No unassigned transactions match your search.
                {:else}
                  No unassigned transactions for the selected account filter.
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="flex flex-col gap-4 border-t border-gray-50 p-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
      <div class="font-medium">
        Showing
        {#if filteredUnassignedTransactions.length > 0}
          <span class="mx-1 rounded border border-gray-200 px-2 py-1 font-bold text-gray-900">
            {(reviewPage - 1) * itemsPerPage + 1}-{Math.min(
              reviewPage * itemsPerPage,
              filteredUnassignedTransactions.length
            )}
          </span>
        {:else}
          <span class="mx-1 rounded border border-gray-200 px-2 py-1 font-bold text-gray-900">0</span>
        {/if}
        of <span class="font-bold text-gray-900">{filteredUnassignedTransactions.length}</span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={() => goToReviewPage(1)}
          disabled={reviewPage === 1}
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          «
        </button>
        <button
          type="button"
          onclick={() => goToReviewPage(reviewPage - 1)}
          disabled={reviewPage === 1}
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ‹
        </button>

        {#each Array(Math.min(5, reviewTotalPages)).fill(0).map((_, i) => {
          let startPage = Math.max(1, reviewPage - 2);
          if (startPage + 4 > reviewTotalPages) startPage = Math.max(1, reviewTotalPages - 4);
          return startPage + i;
        }) as pageNum}
          <button
            type="button"
            onclick={() => goToReviewPage(pageNum)}
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border font-bold transition-colors
                   {reviewPage === pageNum
              ? 'border-accent-600 bg-accent-600 text-white shadow-sm shadow-accent-200'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50'}"
          >
            {pageNum}
          </button>
        {/each}

        {#if reviewTotalPages > 5 && reviewPage < reviewTotalPages - 2}
          <span class="mx-1 text-gray-400">...</span>
          <button
            type="button"
            onclick={() => goToReviewPage(reviewTotalPages)}
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {reviewTotalPages}
          </button>
        {/if}

        <button
          type="button"
          onclick={() => goToReviewPage(reviewPage + 1)}
          disabled={reviewPage === reviewTotalPages || reviewTotalPages === 0}
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ›
        </button>
        <button
          type="button"
          onclick={() => goToReviewPage(reviewTotalPages)}
          disabled={reviewPage === reviewTotalPages || reviewTotalPages === 0}
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          »
        </button>
      </div>
    </div>
  </div>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="flex flex-col gap-3 border-b border-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="text-base font-bold text-gray-900">Statement Summary</h3>
        <p class="text-sm text-gray-500">
          Save the start and end balance printed on your bank statement to verify the computed
          total.
        </p>
      </div>
      <button
        type="button"
        onclick={saveBalances}
        disabled={!hasPendingBalances || isSavingBalances}
        class="flex items-center gap-2 self-start rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors
               disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save size={16} />
        {isSavingBalances ? 'Saving...' : 'Save Balances'}
      </button>
    </div>

    {#if balanceSaveError}
      <p class="px-6 pb-2 text-sm font-medium text-rose-500">{balanceSaveError}</p>
    {/if}

    <div class="grid gap-6 p-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <div class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-semibold text-gray-700" for="summary-statement">Statement</label>
          <SearchableDropdown
            bind:value={summaryStatement}
            clearable={false}
            options={assignedStatements}
            placeholder="Search statements..."
            class="w-full"
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold text-gray-700" for="summary-start-balance">Start Balance</label>
          <input
            id="summary-start-balance"
            type="number"
            step="0.01"
            value={startBalance}
            placeholder="0.00"
            disabled={!summaryStatement || !summaryAccount}
            class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors
                   focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-gray-50"
            oninput={(event) => handleBalanceInput('start', startBalanceKey, event)}
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold text-gray-700" for="summary-saved-end-balance">
            End Balance
          </label>
          <input
            id="summary-saved-end-balance"
            type="number"
            step="0.01"
            value={savedEndBalance}
            placeholder="0.00"
            disabled={!summaryStatement || !summaryAccount}
            class="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors
                   focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-50
                   {summaryBalanceCheck.status === 'mismatch'
              ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
              : 'border-gray-200 focus:border-accent-300 focus:ring-accent-100'}"
            oninput={(event) => handleBalanceInput('end', startBalanceKey, event)}
          />
          <p class="text-xs text-gray-500">As printed on the bank statement.</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold text-gray-700" for="summary-account">Account</label>
          <SearchableDropdown
            bind:value={summaryAccount}
            clearable={false}
            options={summaryAccountOptions}
            placeholder="Search accounts..."
            disabled={!summaryStatement || summaryAccountOptions.length === 0}
            class="w-full"
          />
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-5">
          <p class="text-sm font-semibold text-gray-500">Income</p>
          <p class="mt-2 text-2xl font-bold text-emerald-500">
            {formatter.format(summaryIncome)}
          </p>
        </div>

        <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-5">
          <p class="text-sm font-semibold text-gray-500">Expenses</p>
          <p class="mt-2 text-2xl font-bold text-rose-500">
            {formatter.format(summaryExpenses)}
          </p>
        </div>

        <div
          class="rounded-2xl border p-5 {summaryBalanceCheck.status === 'mismatch'
            ? 'border-rose-200 bg-rose-50/70'
            : 'border-gray-100 bg-gray-50/70'}"
        >
          <p class="text-sm font-semibold text-gray-500">Computed End Balance</p>
          <p
            class="mt-2 text-2xl font-bold {summaryEndBalance >= 0
              ? 'text-accent-600'
              : 'text-rose-500'}"
          >
            {formatter.format(summaryEndBalance)}
          </p>
          {#if summaryStatement && summaryAccount}
            {#if summaryBalanceCheck.status === 'match'}
              <p class="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <CheckCircle2 size={14} />
                Matches saved end balance
              </p>
            {:else if summaryBalanceCheck.status === 'mismatch'}
              <p class="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-600">
                <AlertTriangle size={14} />
                {balanceStatusLabel('mismatch', summaryBalanceCheck.difference)} vs saved
                {formatter.format(summaryBalanceCheck.savedEndBalance ?? 0)}
              </p>
            {:else}
              <p class="mt-2 text-xs font-medium text-gray-500">
                Enter the statement end balance to verify.
              </p>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>

  {:else if activeTab === 'view'}
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-base font-bold text-gray-900">View Statement</h2>
        <p class="text-sm text-gray-500">
          Browse assigned entries and filter by statement or account.
        </p>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchableSelect
          bind:value={statementFilter}
          options={statementFilterOptions}
          formatLabel={formatStatementLabel}
          class="w-56"
        />
        <SearchableSelect
          bind:value={accountFilter}
          options={viewAccountOptions}
          formatLabel={formatAccountLabel}
          class="w-56"
        />
      </div>
    </div>

    <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div class="overflow-x-auto">
        <table class="min-w-[980px] w-full border-collapse text-left">
          <thead>
            <tr class="bg-gray-50/95 text-[13px] text-gray-500">
              <th class="px-6 py-4 font-semibold">Date</th>
              <th class="px-6 py-4 font-semibold">Notes</th>
              <th class="px-6 py-4 font-semibold">Category</th>
              <th class="px-6 py-4 font-semibold">Account</th>
              <th class="px-6 py-4 font-semibold">Amount</th>
              <th class="px-6 py-4 font-semibold">Statement</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            {#each paginatedTransactions as transaction (transaction.id)}
              <tr class="transition-colors hover:bg-gray-50/50">
                <td class="px-6 py-4 text-[13px] font-medium text-gray-600">
                  {formatDayMonthYear(transaction.date)}
                </td>
                <td class="px-6 py-4">
                  <span class="text-[14px] font-bold text-gray-900">{transaction.note}</span>
                </td>
                <td class="px-6 py-4 text-[13px] font-medium text-gray-600">{transaction.category}</td>
                <td class="px-6 py-4 text-[13px] font-medium text-gray-600">{transaction.accountName}</td>
                <td
                  class="px-6 py-4 text-[14px] font-bold {transaction.transactionType === 'Expense'
                    ? 'text-rose-500'
                    : 'text-emerald-500'}"
                >
                  {transaction.transactionType === 'Expense' ? '-' : '+'}
                  {formatter.format(transactionValueInSGD(transaction))}
                </td>
                <td class="px-6 py-4 text-[13px] font-medium text-gray-600">
                  {transaction.statement}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                  No transactions found for the selected filters.
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="flex flex-col gap-4 border-t border-gray-50 p-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <div class="font-medium">
          Showing
          {#if filteredTransactions.length > 0}
            <span class="mx-1 rounded border border-gray-200 px-2 py-1 font-bold text-gray-900">
              {(currentPage - 1) * itemsPerPage + 1}-{Math.min(
                currentPage * itemsPerPage,
                filteredTransactions.length
              )}
            </span>
          {:else}
            <span class="mx-1 rounded border border-gray-200 px-2 py-1 font-bold text-gray-900">0</span>
          {/if}
          of <span class="font-bold text-gray-900">{filteredTransactions.length}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            onclick={() => goToPage(1)}
            disabled={currentPage === 1}
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            «
          </button>
          <button
            type="button"
            onclick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ‹
          </button>

          {#each Array(Math.min(5, totalPages)).fill(0).map((_, i) => {
            let startPage = Math.max(1, currentPage - 2);
            if (startPage + 4 > totalPages) startPage = Math.max(1, totalPages - 4);
            return startPage + i;
          }) as pageNum}
            <button
              type="button"
              onclick={() => goToPage(pageNum)}
              class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border font-bold transition-colors
                     {currentPage === pageNum
                ? 'border-accent-600 bg-accent-600 text-white shadow-sm shadow-accent-200'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'}"
            >
              {pageNum}
            </button>
          {/each}

          {#if totalPages > 5 && currentPage < totalPages - 2}
            <span class="mx-1 text-gray-400">...</span>
            <button
              type="button"
              onclick={() => goToPage(totalPages)}
              class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 font-bold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {totalPages}
            </button>
          {/if}

          <button
            type="button"
            onclick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages || totalPages === 0}
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ›
          </button>
          <button
            type="button"
            onclick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0}
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            »
          </button>
        </div>
      </div>
    </div>
  </div>

  {:else if activeTab === 'summary'}
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex-1">
        <h2 class="text-base font-bold text-gray-900">View Summary</h2>
        <p class="text-sm text-gray-500">
          Computed balances per statement, grouped by account. Statements whose computed end balance
          differs from the saved one are highlighted.
        </p>
        {#if totalMismatchCount > 0}
          <p class="mt-2 flex items-center gap-1.5 text-sm font-bold text-rose-600">
            <AlertTriangle size={15} />
            {totalMismatchCount} statement{totalMismatchCount === 1 ? '' : 's'} do not match the
            saved end balance.
          </p>
        {/if}
        {#if balanceSaveError}
          <p class="mt-2 text-sm font-medium text-rose-500">{balanceSaveError}</p>
        {/if}
      </div>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          class="flex cursor-pointer items-center gap-2 self-start rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-700"
        >
          <input
            type="checkbox"
            bind:checked={mismatchesOnly}
            class="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-100"
          />
          Mismatches only
        </label>
        <div class="relative w-full sm:w-56">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            bind:value={summaryStatementSearch}
            placeholder="Search statement..."
            class="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
        </div>
        <button
          type="button"
          onclick={saveBalances}
          disabled={!hasPendingBalances || isSavingBalances}
          class="flex items-center gap-2 self-start rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors
                 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} />
          {isSavingBalances ? 'Saving...' : 'Save Balances'}
        </button>
      </div>
    </div>

    <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      {#if summaryGroups.length === 0}
        <p class="px-6 py-12 text-center text-gray-500">No assigned statements yet.</p>
      {:else if filteredSummaryGroups.length === 0}
        <p class="px-6 py-12 text-center text-gray-500">
          {#if mismatchesOnly && !summaryStatementSearch.trim()}
            Every statement matches its saved end balance.
          {:else}
            No statements match your search.
          {/if}
        </p>
      {:else}
        <div class="divide-y divide-gray-50">
          {#each filteredSummaryGroups as group (group.accountName)}
            <div>
              <button
                type="button"
                onclick={() => toggleSummaryAccount(group.accountName)}
                class="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-gray-50/70"
                aria-expanded={isSummaryAccountExpanded(group.accountName) ? 'true' : 'false'}
              >
                <ChevronRight
                  size={18}
                  class="shrink-0 text-gray-400 transition-transform {isSummaryAccountExpanded(
                    group.accountName
                  )
                    ? 'rotate-90'
                    : ''}"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-[15px] font-bold text-gray-900">{group.accountName}</p>
                  <p class="text-sm text-gray-500">{group.accountType || 'Unknown type'}</p>
                </div>
                {#if group.mismatchCount > 0}
                  <span
                    class="flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700"
                  >
                    <AlertTriangle size={13} />
                    {group.mismatchCount} mismatch{group.mismatchCount === 1 ? '' : 'es'}
                  </span>
                {/if}
                <span class="text-xs font-semibold text-gray-400">
                  {group.rows.length} statement{group.rows.length === 1 ? '' : 's'}
                </span>
              </button>

              {#if isSummaryAccountExpanded(group.accountName)}
                <div class="overflow-x-auto border-t border-gray-50 bg-gray-50/30 px-6 pb-4">
                  <table class="min-w-[860px] w-full border-collapse text-left">
                    <thead>
                      <tr class="text-[13px] text-gray-500">
                        <th class="py-3 pr-4 font-semibold">Statement</th>
                        <th class="py-3 pr-4 font-semibold">Start Balance</th>
                        <th class="py-3 pr-4 font-semibold">Saved End Balance</th>
                        <th class="py-3 pr-4 font-semibold">Computed End Balance</th>
                        <th class="py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                      {#each group.rows as row (group.accountName + row.statement)}
                        {@const balanceKey = buildBalanceKey(row.statement, group.accountName)}
                        <tr
                          class="transition-colors {row.status === 'mismatch'
                            ? 'bg-rose-50/80 hover:bg-rose-50'
                            : 'hover:bg-surface/70'}"
                        >
                          <td class="py-3 pr-4 text-[14px] font-semibold text-gray-900">
                            {row.statement}
                          </td>
                          <td class="py-3 pr-4">
                            <input
                              type="number"
                              step="0.01"
                              value={balances.start[balanceKey] ?? ''}
                              placeholder="0.00"
                              aria-label={`Start balance for ${group.accountName} (${row.statement})`}
                              class="w-36 rounded-xl border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
                              oninput={(event) => handleBalanceInput('start', balanceKey, event)}
                            />
                          </td>
                          <td class="py-3 pr-4">
                            <input
                              type="number"
                              step="0.01"
                              value={balances.end[balanceKey] ?? ''}
                              placeholder="0.00"
                              aria-label={`Saved end balance for ${group.accountName} (${row.statement})`}
                              class="w-36 rounded-xl border bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition-colors focus:outline-none focus:ring-2
                                     {row.status === 'mismatch'
                                ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                                : 'border-gray-200 focus:border-accent-300 focus:ring-accent-100'}"
                              oninput={(event) => handleBalanceInput('end', balanceKey, event)}
                            />
                          </td>
                          <td
                            class="py-3 pr-4 text-[14px] font-bold {row.status === 'mismatch'
                              ? 'text-rose-600'
                              : 'text-gray-900'}"
                          >
                            {formatter.format(row.endBalance)}
                          </td>
                          <td class="py-3">
                            <span
                              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold
                                     {row.status === 'mismatch'
                                ? 'bg-rose-100 text-rose-700'
                                : row.status === 'match'
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : 'bg-gray-100 text-gray-500'}"
                            >
                              {#if row.status === 'mismatch'}
                                <AlertTriangle size={13} />
                              {:else if row.status === 'match'}
                                <CheckCircle2 size={13} />
                              {/if}
                              {balanceStatusLabel(row.status, row.difference)}
                            </span>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
  {/if}

  <TransactionEditModal
    transaction={editingTransaction}
    mode={transactionModalMode === 'create' ? 'create' : 'edit'}
    open={transactionModalMode !== 'closed'}
    statementOptions={statementOptions}
    {createDefaults}
    onClose={closeEditModal}
    onSaved={handleTransactionSaved}
  />
</div>

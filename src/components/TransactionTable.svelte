<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { transactionValueInSGD } from '../lib/currency';
  import { formatDayMonthYear } from '../lib/dateFormat';
  import { matchesAmountSearch } from '../lib/search';
  import {
    collectStatementOptions,
    compareStatements,
    isUnassignedStatement,
    normalizeStatement,
  } from '../lib/statement';
  import type { Transaction } from '../lib/types';
  import { Search, ChevronDown, Filter, MoreVertical, Pencil, Save } from 'lucide-svelte';
  import SearchableDropdown from './SearchableDropdown.svelte';
  import TransactionEditModal from './TransactionEditModal.svelte';

  let {
    year = null,
    categoryGroups = null,
    month = null,
    title = 'Transactions',
    titleHighlight = null,
    showFilters = true,
    useSgdAmounts = false,
    includeAllTypesForGroups = false,
    expensesOnly = false,
    excludeGroups = [],
    showStatusFilter = true,
    showDateFilter = true,
    editableTripName = false,
    editable = false,
    categoryLabels = null,
    budgetNetEligible = false,
    categoryFilter = $bindable('All Categories'),
  }: {
    year?: string | null;
    categoryGroups?: string[] | null;
    month?: number | null;
    title?: string;
    titleHighlight?: string | null;
    showFilters?: boolean;
    useSgdAmounts?: boolean;
    includeAllTypesForGroups?: boolean;
    expensesOnly?: boolean;
    excludeGroups?: string[];
    showStatusFilter?: boolean;
    showDateFilter?: boolean;
    editableTripName?: boolean;
    editable?: boolean;
    categoryLabels?: string[] | null;
    /** Match budget net spend rules: affect cash flow and expense or income only. */
    budgetNetEligible?: boolean;
    categoryFilter?: string;
  } = $props();

  let searchQuery = $state('');
  let sortColumn = $state<'date' | 'value' | 'category'>('date');
  let sortDirection = $state<'asc' | 'desc'>('desc');
  let statusFilter = $state('All Status');
  let showStatusDropdown = $state(false);
  const statusOptions = ['All Status', 'Income', 'Expense'];
  let statementFilter = $state('All Statements');
  let affectCashFlowFilter = $state('');

  let startDate = $state('');
  let endDate = $state('');
  
  let currentPage = $state(1);
  const itemsPerPage = 10;

  let tripNameDrafts = $state<Record<string, string>>({});
  let isSavingTripNames = $state(false);
  let tripNameError = $state('');
  let tripNameFilter = $state<'all' | 'has' | 'none'>('all');
  let editingTransaction = $state<Transaction | null>(null);
  let editModalOpen = $state(false);

  const statementOptions = $derived.by(() => {
    const base = collectStatementOptions(financeStore.transactions);
    const custom = financeStore.statements.map((statement) => statement.value);
    return Array.from(new Set([...base, ...custom])).sort(compareStatements);
  });

  const formatter = $derived(
    new Intl.NumberFormat(useSgdAmounts ? 'en-SG' : 'en-US', {
      style: 'currency',
      currency: useSgdAmounts ? 'SGD' : 'USD',
    })
  );

  function tripNameValue(tx: { id: string; tripName: string }): string {
    return tx.id in tripNameDrafts ? tripNameDrafts[tx.id] : (tx.tripName ?? '');
  }

  function setTripName(tx: { id: string; tripName: string }, value: string) {
    if (value === (tx.tripName ?? '')) {
      const { [tx.id]: _removed, ...rest } = tripNameDrafts;
      tripNameDrafts = rest;
    } else {
      tripNameDrafts = { ...tripNameDrafts, [tx.id]: value };
    }
  }

  const hasPendingTripNames = $derived(Object.keys(tripNameDrafts).length > 0);

  async function saveTripNames() {
    if (!hasPendingTripNames) return;
    isSavingTripNames = true;
    tripNameError = '';
    try {
      await financeStore.updateTransactionTripNames(tripNameDrafts);
      tripNameDrafts = {};
    } catch (error) {
      console.error(error);
      tripNameError = 'Failed to save trip names.';
    }
    isSavingTripNames = false;
  }

  // Transactions matching the structural scope (category group / month / year),
  // used both for the category filter options and the displayed rows.
  const scopedTransactions = $derived.by(() => {
    let result = financeStore.transactions;

    if (categoryGroups !== null) {
      result = result.filter((t) => {
        if (!t.categoryGroup || !categoryGroups.includes(t.categoryGroup)) {
          return false;
        }
        if (includeAllTypesForGroups) return true;
        return t.transactionType === 'Expense' && t.affectCashFlow;
      });
    } else if (month !== null) {
      result = result.filter((t) => t.affectCashFlow && t.date.getMonth() === month);
    }

    if (expensesOnly) {
      result = result.filter((t) => t.transactionType === 'Expense' && t.affectCashFlow);
    }

    if (budgetNetEligible) {
      result = result.filter(
        (t) =>
          t.affectCashFlow &&
          (t.transactionType === 'Expense' || t.transactionType === 'Income')
      );
    }

    if (excludeGroups.length > 0) {
      result = result.filter((t) => !excludeGroups.includes(t.categoryGroup));
    }

    if (year !== null) {
      result = result.filter((t) => `${t.date.getFullYear()}` === year);
    }

    if (categoryLabels !== null) {
      const allowed = new Set(categoryLabels);
      result = result.filter((t) => allowed.has(t.category));
    }

    return result;
  });

  const categoryOptions = $derived.by(() => {
    const set = new Set(
      scopedTransactions.map((t) => t.category).filter(Boolean)
    );
    return ['All Categories', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  });

  const statementFilterOptions = $derived.by(() => {
    const set = new Set<string>();
    let hasUnassigned = false;

    scopedTransactions.forEach((transaction) => {
      if (isUnassignedStatement(transaction.statement)) {
        hasUnassigned = true;
        return;
      }
      const normalized =
        normalizeStatement(transaction.statement) ?? transaction.statement.trim();
      if (normalized) set.add(normalized);
    });

    financeStore.statements.forEach((statement) => set.add(statement.value));

    const options = ['All Statements'];
    if (hasUnassigned) options.push('Unassigned');
    return [...options, ...Array.from(set).sort(compareStatements)];
  });

  const filteredAndSortedTransactions = $derived.by(() => {
    let result = scopedTransactions;

    if (categoryFilter !== 'All Categories') {
      result = result.filter((t) => t.category === categoryFilter);
    }

    if (statementFilter !== 'All Statements') {
      if (statementFilter === 'Unassigned') {
        result = result.filter((t) => isUnassignedStatement(t.statement));
      } else {
        result = result.filter((t) => {
          const normalized =
            normalizeStatement(t.statement) ?? t.statement.trim();
          return normalized === statementFilter;
        });
      }
    }

    if (editableTripName && tripNameFilter !== 'all') {
      result = result.filter((t) => {
        const hasTrip = (t.tripName ?? '').trim().length > 0;
        return tripNameFilter === 'has' ? hasTrip : !hasTrip;
      });
    }

    if (statusFilter !== 'All Status') {
      result = result.filter(t => t.transactionType === statusFilter);
    }

    if (affectCashFlowFilter === 'true') {
      result = result.filter((t) => t.affectCashFlow);
    } else if (affectCashFlowFilter === 'false') {
      result = result.filter((t) => !t.affectCashFlow);
    }

    if (startDate) {
      const start = new Date(`${startDate}T00:00:00`);
      result = result.filter((t) => t.date >= start);
    }

    if (endDate) {
      const end = new Date(`${endDate}T23:59:59.999`);
      result = result.filter((t) => t.date <= end);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.note.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.tripName ?? '').toLowerCase().includes(q) ||
          matchesAmountSearch(searchQuery, displayAmount(t), t.value)
      );
    }
    
    return [...result].sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'date') {
        comparison = a.date.getTime() - b.date.getTime();
      } else if (sortColumn === 'category') {
        comparison = a.category.localeCompare(b.category);
      } else if (sortColumn === 'value') {
        comparison = compareAmount(a, b);
        return comparison;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  });

  const totalPages = $derived(Math.ceil(filteredAndSortedTransactions.length / itemsPerPage) || 1);
  const paginatedTransactions = $derived.by(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedTransactions.slice(start, start + itemsPerPage);
  });

  // Reset to page 1 when filter/sort changes
  $effect(() => {
    searchQuery;
    sortColumn;
    sortDirection;
    statusFilter;
    categoryFilter;
    startDate;
    endDate;
    tripNameFilter;
    categoryLabels;
    budgetNetEligible;
    affectCashFlowFilter;
    statementFilter;
    currentPage = 1;
  });

  // Reset the category filter if it's no longer valid for the current scope.
  $effect(() => {
    if (!categoryOptions.includes(categoryFilter)) {
      categoryFilter = 'All Categories';
    }
  });

  $effect(() => {
    if (!statementFilterOptions.includes(statementFilter)) {
      statementFilter = 'All Statements';
    }
  });

  // Default back to date sort when breakdown filters change
  $effect(() => {
    year;
    month;
    categoryGroups;
    sortColumn = 'date';
    sortDirection = 'desc';
  });

  function displayAmount(tx: (typeof financeStore.transactions)[number]) {
    return useSgdAmounts ? transactionValueInSGD(tx) : tx.value;
  }

  function signedAmount(tx: (typeof financeStore.transactions)[number]) {
    const amount = displayAmount(tx);
    return tx.transactionType === 'Expense' ? -amount : amount;
  }

  function compareAmount(
    a: (typeof financeStore.transactions)[number],
    b: (typeof financeStore.transactions)[number]
  ) {
    const comparison = signedAmount(a) - signedAmount(b);
    return sortDirection === 'desc' ? -comparison : comparison;
  }

  function toggleSort(column: 'date' | 'value' | 'category') {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'desc';
    }
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
    }
  }

  function handleOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.status-dropdown')) {
      showStatusDropdown = false;
    }
  }

  function clearDateRange() {
    startDate = '';
    endDate = '';
  }

  function openEditModal(transaction: Transaction) {
    editingTransaction = transaction;
    editModalOpen = true;
  }

  function closeEditModal() {
    editingTransaction = null;
    editModalOpen = false;
  }
</script>

<svelte:window onclick={handleOutsideClick} />

<div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden h-full flex flex-col">
  <div class="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <h2 class="text-[17px] font-bold text-gray-900">
        {title}{#if titleHighlight}{' '}- <span class="text-accent-600">{titleHighlight}</span>{/if}
      </h2>
      {#if editableTripName}
        <button
          type="button"
          onclick={saveTripNames}
          disabled={!hasPendingTripNames || isSavingTripNames}
          class="flex items-center gap-2 rounded-xl bg-accent-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={15} />
          {isSavingTripNames ? 'Saving...' : 'Save Trip Names'}
        </button>
        {#if tripNameError}
          <span class="text-sm font-semibold text-rose-500">{tripNameError}</span>
        {/if}
      {/if}
    </div>
    
    {#if showFilters}
    <div class="flex items-center gap-3">
      {#if editableTripName}
        <div class="flex items-center rounded-xl border border-gray-200 bg-surface p-0.5 text-sm font-semibold">
          {#each [{ id: 'all', label: 'All' }, { id: 'has', label: 'Has Trip' }, { id: 'none', label: 'No Trip' }] as option (option.id)}
            <button
              type="button"
              onclick={() => (tripNameFilter = option.id as 'all' | 'has' | 'none')}
              class="rounded-[10px] px-3 py-1.5 transition-colors
                     {tripNameFilter === option.id
                ? 'bg-accent-600 text-white shadow-sm shadow-accent-200'
                : 'text-gray-500 hover:text-gray-800'}"
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
      <div class="relative w-64">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input 
          type="text" 
          bind:value={searchQuery} 
          placeholder="Search notes or amount..." 
          class="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-accent-300 focus:ring-2 focus:ring-accent-100 text-sm bg-gray-50"
        />
      </div>

      {#if showStatusFilter}
      <div class="relative status-dropdown">
        <button 
          onclick={() => showStatusDropdown = !showStatusDropdown}
          class="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 bg-surface hover:bg-gray-50 transition-colors">
          {statusFilter}
          <ChevronDown size={14} class="text-gray-400" />
        </button>
        {#if showStatusDropdown}
          <div class="absolute top-full left-0 mt-1 w-32 bg-surface border border-gray-200 rounded-xl shadow-lg z-10 py-1 overflow-hidden">
            {#each statusOptions as option}
              <button 
                class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors {statusFilter === option ? 'font-bold bg-accent-50 text-accent-600' : ''}"
                onclick={() => { statusFilter = option; showStatusDropdown = false; }}>
                {option}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      {/if}

      <select
        bind:value={affectCashFlowFilter}
        aria-label="Filter by affect cash flow"
        class="rounded-xl border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
      >
        <option value="">All Cash Flow</option>
        <option value="true">Affects Cash Flow</option>
        <option value="false">No Cash Flow</option>
      </select>

      <SearchableDropdown
        bind:value={categoryFilter}
        clearable={false}
        options={categoryOptions}
        placeholder="Search categories..."
        class="w-48"
      />

      <SearchableDropdown
        bind:value={statementFilter}
        clearable={false}
        options={statementFilterOptions}
        placeholder="Search statements..."
        class="w-44"
      />

      {#if showDateFilter}
      <div class="flex items-center gap-2">
        <input
          type="date"
          bind:value={startDate}
          max={endDate || undefined}
          aria-label="Start date"
          class="px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 bg-surface focus:outline-none focus:border-accent-300 focus:ring-2 focus:ring-accent-100"
        />
        <span class="text-sm text-gray-400">to</span>
        <input
          type="date"
          bind:value={endDate}
          min={startDate || undefined}
          aria-label="End date"
          class="px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 bg-surface focus:outline-none focus:border-accent-300 focus:ring-2 focus:ring-accent-100"
        />
        {#if startDate || endDate}
          <button
            type="button"
            onclick={clearDateRange}
            class="px-2.5 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 bg-surface hover:bg-gray-50 transition-colors"
            aria-label="Clear date range"
          >
            Clear
          </button>
        {/if}
      </div>
      {/if}

      <button disabled class="p-2 border border-gray-200 text-gray-500 rounded-[10px] bg-surface opacity-50 cursor-not-allowed">
        <Filter size={18} />
      </button>
    </div>
    {/if}
  </div>

  <div class="overflow-x-auto flex-1">
    <table class="w-full text-left border-collapse min-w-[900px]">
      <thead>
        <tr class="bg-gray-50/50 text-gray-500 text-[13px]">
          <th class="px-6 py-4 font-semibold w-10">
            <input type="checkbox" disabled class="w-4 h-4 rounded border-gray-300 text-accent-500 focus:ring-accent-500 bg-surface opacity-50 cursor-not-allowed" />
          </th>
          <th class="px-2 py-4 font-semibold">
            <div class="flex items-center gap-1.5">
              Transaction ID
            </div>
          </th>
          <th class="px-6 py-4 font-semibold">Notes</th>
          <th class="px-6 py-4 font-semibold cursor-pointer hover:text-gray-700" onclick={() => toggleSort('category')}>
            <div class="flex items-center gap-1.5">
              Category
              {#if sortColumn === 'category'}
                <ChevronDown size={14} class="opacity-50 transition-transform {sortDirection === 'asc' ? 'rotate-180' : ''}" />
              {/if}
            </div>
          </th>
          <th class="px-6 py-4 font-semibold cursor-pointer hover:text-gray-700" onclick={() => toggleSort('value')}>
            <div class="flex items-center gap-1.5">
              Amount{useSgdAmounts ? ' (SGD)' : ''}
              {#if sortColumn === 'value'}
                <ChevronDown size={14} class="opacity-50 transition-transform {sortDirection === 'asc' ? 'rotate-180' : ''}" />
              {/if}
            </div>
          </th>
          <th class="px-6 py-4 font-semibold cursor-pointer hover:text-gray-700" onclick={() => toggleSort('date')}>
            <div class="flex items-center gap-1.5">
              Date
              {#if sortColumn === 'date'}
                <ChevronDown size={14} class="opacity-50 transition-transform {sortDirection === 'asc' ? 'rotate-180' : ''}" />
              {/if}
            </div>
          </th>
          {#if editableTripName}
            <th class="px-6 py-4 font-semibold">Trip Name</th>
          {/if}
          <th class="px-6 py-4 font-semibold w-10"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50">
        {#each paginatedTransactions as tx (tx.id)}
          <tr class="hover:bg-gray-50/50 transition-colors group">
            <td class="px-6 py-4">
              <input type="checkbox" disabled class="w-4 h-4 rounded border-gray-300 text-accent-500 focus:ring-accent-500 bg-surface opacity-50 cursor-not-allowed" />
            </td>
            <td class="px-2 py-4 text-[13px] text-gray-400 font-semibold tracking-wide">
              TXN-{tx.id.substring(0,8).toUpperCase()}
            </td>
            <td class="px-6 py-4">
              <span class="font-bold text-[14px] text-gray-900 group-hover:text-accent-600 transition-colors">{tx.note}</span>
            </td>
            <td class="px-6 py-4 text-[13px] text-gray-600 font-medium">
              {tx.category}
            </td>
            <td class="px-6 py-4 text-[14px] font-bold {tx.transactionType === 'Expense' ? 'text-rose-500' : 'text-emerald-500'}">
              {tx.transactionType === 'Expense' ? '-' : '+'}{formatter.format(displayAmount(tx))}
            </td>
            <td class="px-6 py-4 text-[13px] text-gray-600 font-medium">
              {formatDayMonthYear(tx.date)} · {tx.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </td>
            {#if editableTripName}
              <td class="px-6 py-4">
                <input
                  type="text"
                  value={tripNameValue(tx)}
                  oninput={(event) => setTripName(tx, (event.currentTarget as HTMLInputElement).value)}
                  placeholder="Add trip..."
                  class="w-40 rounded-lg border px-3 py-1.5 text-[13px] font-medium text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-100
                         {tx.id in tripNameDrafts ? 'border-accent-300 bg-accent-50/40' : 'border-gray-200 bg-surface'}"
                />
              </td>
            {/if}
            <td class="px-6 py-4 text-right">
              {#if editable}
                <button
                  type="button"
                  onclick={() => openEditModal(tx)}
                  class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-accent-600"
                  aria-label="Edit entry"
                >
                  <Pencil size={16} />
                </button>
              {:else}
                <button disabled class="text-gray-400 p-1 rounded-lg opacity-50 cursor-not-allowed">
                  <MoreVertical size={18} />
                </button>
              {/if}
            </td>
          </tr>
        {/each}
        {#if paginatedTransactions.length === 0}
          <tr>
            <td colspan={editableTripName ? 8 : 7} class="px-6 py-12 text-center text-gray-500">
              No transactions found matching your criteria.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
  
  <div class="p-6 border-t border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-gray-500">
    <div class="font-medium">
      Showing 
      {#if filteredAndSortedTransactions.length > 0}
        <span class="font-bold text-gray-900 mx-1 border border-gray-200 px-2 py-1 rounded">{(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredAndSortedTransactions.length)}</span>
      {:else}
        <span class="font-bold text-gray-900 mx-1 border border-gray-200 px-2 py-1 rounded">0</span>
      {/if}
      of <span class="font-bold text-gray-900">{filteredAndSortedTransactions.length}</span>
    </div>
    <div class="flex items-center gap-1.5">
      <button 
        onclick={() => goToPage(1)}
        disabled={currentPage === 1}
        class="w-8 h-8 flex items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">«</button>
      <button 
        onclick={() => goToPage(currentPage - 1)}
        disabled={currentPage === 1}
        class="w-8 h-8 flex items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">‹</button>
      
      {#each Array(Math.min(5, totalPages)).fill(0).map((_, i) => {
        let startPage = Math.max(1, currentPage - 2);
        if (startPage + 4 > totalPages) startPage = Math.max(1, totalPages - 4);
        return startPage + i;
      }) as pageNum}
        <button 
          onclick={() => goToPage(pageNum)}
          class="w-8 h-8 flex items-center justify-center rounded-[8px] border font-bold cursor-pointer transition-colors
                 {currentPage === pageNum 
                   ? 'bg-accent-600 text-white border-accent-600 shadow-sm shadow-accent-200' 
                   : 'border-gray-200 text-gray-700 hover:bg-gray-50'}"
        >
          {pageNum}
        </button>
      {/each}

      {#if totalPages > 5 && currentPage < totalPages - 2}
        <span class="mx-1 text-gray-400">...</span>
        <button 
          onclick={() => goToPage(totalPages)}
          class="w-8 h-8 flex items-center justify-center rounded-[8px] border border-gray-200 font-bold text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
          {totalPages}
        </button>
      {/if}

      <button 
        onclick={() => goToPage(currentPage + 1)}
        disabled={currentPage === totalPages || totalPages === 0}
        class="w-8 h-8 flex items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">›</button>
      <button 
        onclick={() => goToPage(totalPages)}
        disabled={currentPage === totalPages || totalPages === 0}
        class="w-8 h-8 flex items-center justify-center rounded-[8px] border border-gray-200 text-gray-400 hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">»</button>
    </div>
  </div>
</div>

<TransactionEditModal
  transaction={editingTransaction}
  open={editModalOpen}
  statementOptions={statementOptions}
  onClose={closeEditModal}
/>

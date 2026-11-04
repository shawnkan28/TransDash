<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { currencyFormatter as formatter } from '../../lib/formatters';
  import {
    accumulateMonthlyBudgetNet,
    applyOverspendSpillover,
    categoriesByMonthlyBudgetId,
    categoryBudgetIdMap,
    monthlyBudgetBarState,
    MONTHLY_BUDGET_TRAVEL_GROUP,
  } from '../../lib/monthlyBudget';
  import type { MonthlyBudget } from '../../lib/types';
  import TransactionTable from '../TransactionTable.svelte';
  import BudgetProgressBar from '../BudgetProgressBar.svelte';
  import MonthlyBudgetLeftoverChart from '../MonthlyBudgetLeftoverChart.svelte';
  import BudgetCategoryBarChart from '../BudgetCategoryBarChart.svelte';

  // ---- Monthly Budget (Needs / Wants / Savings, etc.) ----
  const MONTH_OPTIONS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ] as const;

  const nowForMonthlyBudget = new Date();
  let monthlyBudgetYear = $state(String(nowForMonthlyBudget.getFullYear()));
  let monthlyBudgetMonth = $state(nowForMonthlyBudget.getMonth());
  let selectedMonthlyBudgetRowId = $state<string | null>(null);
  let monthlyTransactionCategoryFilter = $state('All Categories');

  $effect(() => {
    monthlyBudgetYear;
    monthlyBudgetMonth;
    selectedMonthlyBudgetRowId = null;
  });

  $effect(() => {
    monthlyBudgetYear;
    monthlyBudgetMonth;
    selectedMonthlyBudgetRowId;
    monthlyTransactionCategoryFilter = 'All Categories';
  });

  function handleMonthlyCategorySelect(category: string | null) {
    monthlyTransactionCategoryFilter = category ?? 'All Categories';
  }

  const monthlyBudgetYears = $derived.by(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    financeStore.transactions.forEach((transaction) => {
      if (Number.isNaN(transaction.date.getTime())) return;
      set.add(String(transaction.date.getFullYear()));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  });

  const selectedMonthlyBudgetLabel = $derived(
    new Date(Number(monthlyBudgetYear), Number(monthlyBudgetMonth), 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  );

  const selectedMonthlyBudgetRow = $derived(
    financeStore.monthlyBudgets.find((budget) => budget.id === selectedMonthlyBudgetRowId) ?? null
  );

  function toggleMonthlyBudgetRow(budgetId: string) {
    if (selectedMonthlyBudgetRowId === budgetId) return;
    selectedMonthlyBudgetRowId = budgetId;
  }

  const categoryMonthlyBudgetMap = $derived(categoryBudgetIdMap(financeStore.categories));

  const monthlyBudgetCategoryLabels = $derived(
    categoriesByMonthlyBudgetId(financeStore.categories)
  );

  const selectedMonthlyBudgetRowCategories = $derived(
    selectedMonthlyBudgetRowId
      ? (monthlyBudgetCategoryLabels.get(selectedMonthlyBudgetRowId) ?? [])
      : []
  );

  const monthlyOwnNetByBudgetId = $derived.by(() => {
    const year = Number(monthlyBudgetYear);
    const month = Number(monthlyBudgetMonth);
    const totals = new Map<string, number>();

    financeStore.monthlyBudgets.forEach((budget) => totals.set(budget.id, 0));
    accumulateMonthlyBudgetNet(
      totals,
      financeStore.transactions,
      categoryMonthlyBudgetMap,
      { year, month }
    );

    return totals;
  });

  const monthlyNetByBudgetId = $derived(
    applyOverspendSpillover(financeStore.monthlyBudgets, monthlyOwnNetByBudgetId)
  );

  /** Overspend from other budgets that this one absorbed (covering budgets and savings). */
  function monthlySpillover(budget: { id: string }): number {
    const effective = monthlyNetByBudgetId.get(budget.id) ?? 0;
    const own = monthlyOwnNetByBudgetId.get(budget.id) ?? 0;
    return effective - own;
  }

  function monthlyRemaining(budgetId: string, amount: number): number {
    return amount - (monthlyNetByBudgetId.get(budgetId) ?? 0);
  }

  function monthlyBar(budget: MonthlyBudget) {
    return monthlyBudgetBarState(budget, monthlyNetByBudgetId.get(budget.id) ?? 0);
  }
</script>

  <div class="flex flex-wrap items-end justify-between gap-4 rounded-[20px] border border-gray-100 bg-surface px-6 py-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Filter</p>
      <p class="mt-1 text-sm text-gray-600">
        Showing data for <span class="font-semibold text-gray-800">{monthlyBudgetYear}</span>
      </p>
    </div>
    <div>
      <label for="monthly-budget-year" class="mb-1 block text-xs font-semibold text-gray-500">
        Year
      </label>
      <select
        id="monthly-budget-year"
        bind:value={monthlyBudgetYear}
        class="min-w-[120px] rounded-xl border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
      >
        {#each monthlyBudgetYears as year (year)}
          <option value={year}>{year}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="flex flex-col gap-4 border-b border-gray-50 px-6 py-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-base font-bold text-gray-900">Monthly Budget</h2>
        <p class="text-sm text-gray-500">
          Track spending for <span class="font-semibold text-gray-700">{selectedMonthlyBudgetLabel}</span>.
          Assign categories in <span class="font-semibold text-gray-700">Settings → Category Rules</span>;
          set salary and allocations in <span class="font-semibold text-gray-700">Settings → Budgets</span>.
          {#if financeStore.monthlySalary > 0}
            <span class="block mt-1">Monthly salary: {formatter.format(financeStore.monthlySalary)}</span>
          {/if}
        </p>
      </div>
      <div>
        <label for="monthly-budget-month" class="mb-1 block text-xs font-semibold text-gray-500">
          Month
        </label>
        <select
          id="monthly-budget-month"
          bind:value={monthlyBudgetMonth}
          class="min-w-[140px] rounded-xl border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
        >
          {#each MONTH_OPTIONS as monthName, monthIndex (monthName)}
            <option value={monthIndex}>{monthName}</option>
          {/each}
        </select>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-[720px] w-full border-collapse text-left">
        <thead>
          <tr class="bg-gray-50/95 text-[13px] text-gray-500">
            <th class="px-6 py-4 font-semibold">Budget</th>
            <th class="px-6 py-4 font-semibold">Monthly Limit</th>
            <th class="px-6 py-4 font-semibold">Net Spend</th>
            <th class="px-6 py-4 font-semibold">Remaining</th>
            <th class="px-6 py-4 font-semibold w-[280px]">Progress</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          {#each financeStore.monthlyBudgets as budget (budget.id)}
            {@const net = monthlyNetByBudgetId.get(budget.id) ?? 0}
            {@const remaining = monthlyRemaining(budget.id, budget.amount)}
            {@const bar = monthlyBar(budget)}
            {@const overBudget = budget.amount > 0 && remaining < 0}
            {@const labels = monthlyBudgetCategoryLabels.get(budget.id) ?? []}
            <tr
              class="transition-colors cursor-pointer hover:bg-gray-50/50 {selectedMonthlyBudgetRowId === budget.id
                ? 'bg-accent-50/70 ring-1 ring-inset ring-accent-200'
                : ''}"
              onclick={() => toggleMonthlyBudgetRow(budget.id)}
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleMonthlyBudgetRow(budget.id);
                }
              }}
              tabindex="0"
              aria-selected={selectedMonthlyBudgetRowId === budget.id}
            >
              <td class="px-6 py-4">
                <p class="text-[14px] font-bold text-gray-900">{budget.name}</p>
                {#if labels.length > 0}
                  <p class="mt-0.5 text-xs text-gray-400">
                    {labels.join(', ')}
                  </p>
                {:else}
                  <p class="mt-0.5 text-xs italic text-gray-400">
                    No category labels assigned in Category Rules
                  </p>
                {/if}
                {#if monthlySpillover(budget) >= 0.005}
                  <p class="mt-0.5 text-xs font-medium text-amber-600">
                    Includes {formatter.format(monthlySpillover(budget))} overspend from other budgets
                  </p>
                {/if}
              </td>
              <td class="px-6 py-4 text-[14px] font-semibold text-gray-700">
                {formatter.format(budget.amount)}
              </td>
              <td
                class="px-6 py-4 text-[14px] font-bold {net > 0
                  ? 'text-rose-500'
                  : net < 0
                    ? 'text-emerald-500'
                    : 'text-gray-500'}"
              >
                {formatter.format(net)}
              </td>
              <td
                class="px-6 py-4 text-[14px] font-bold {overBudget ? 'text-rose-500' : 'text-emerald-500'}"
              >
                {formatter.format(remaining)}
              </td>
              <td class="px-6 py-4">
                <BudgetProgressBar percent={bar.percent} status={bar.status} showLabel />
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                No monthly budgets configured. Add them in Settings → Budgets.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="border-b border-gray-50 px-6 py-4">
      <h2 class="text-base font-bold text-gray-900">Yearly Category Spending</h2>
      <p class="text-sm text-gray-500">
        {#if selectedMonthlyBudgetRow}
          Expense and income by category for <span class="font-semibold text-gray-700">{monthlyBudgetYear}</span>
          — <span class="font-semibold text-gray-700">{selectedMonthlyBudgetRow.name}</span>.
        {:else}
          Select a monthly budget above to view category spending for
          <span class="font-semibold text-gray-700">{monthlyBudgetYear}</span>.
        {/if}
      </p>
    </div>
    <div class="px-6 py-5">
      <BudgetCategoryBarChart
        budgetId={selectedMonthlyBudgetRowId ?? ''}
        year={monthlyBudgetYear}
        selectedCategory={monthlyTransactionCategoryFilter === 'All Categories'
          ? null
          : monthlyTransactionCategoryFilter}
        onSelectCategory={handleMonthlyCategorySelect}
      />
    </div>
  </div>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="border-b border-gray-50 px-6 py-4">
      <h2 class="text-base font-bold text-gray-900">Monthly Spending Trend</h2>
      <p class="text-sm text-gray-500">
        {#if selectedMonthlyBudgetRow}
          Net spending per month for <span class="font-semibold text-gray-700">{monthlyBudgetYear}</span>
          — <span class="font-semibold text-gray-700">{selectedMonthlyBudgetRow.name}</span>
          (expenses minus income) against the monthly limit.
        {:else}
          Select a monthly budget above to view spending trends for
          <span class="font-semibold text-gray-700">{monthlyBudgetYear}</span>.
        {/if}
      </p>
    </div>
    <div class="px-6 py-5">
      <MonthlyBudgetLeftoverChart
        budgetId={selectedMonthlyBudgetRowId ?? ''}
        year={monthlyBudgetYear}
      />
    </div>
  </div>

  {#if selectedMonthlyBudgetRow}
    <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div class="border-b border-gray-50 px-6 py-4">
        <h2 class="text-base font-bold text-gray-900">Monthly Category Spending</h2>
        <p class="text-sm text-gray-500">
          Expense and income by category for <span class="font-semibold text-gray-700">{selectedMonthlyBudgetLabel}</span>
          — <span class="font-semibold text-gray-700">{selectedMonthlyBudgetRow.name}</span>.
        </p>
      </div>
      <div class="px-6 py-5">
        <BudgetCategoryBarChart
          budgetId={selectedMonthlyBudgetRowId ?? ''}
          year={monthlyBudgetYear}
          month={Number(monthlyBudgetMonth)}
          selectedCategory={monthlyTransactionCategoryFilter === 'All Categories'
            ? null
            : monthlyTransactionCategoryFilter}
          onSelectCategory={handleMonthlyCategorySelect}
        />
      </div>
    </div>

    <div class="flex items-center justify-between rounded-xl border border-accent-100 bg-accent-50 px-4 py-2.5">
      <p class="text-sm font-semibold text-accent-700">
        Showing transactions for {selectedMonthlyBudgetRow.name} — {selectedMonthlyBudgetLabel}
      </p>
      <button
        type="button"
        onclick={() => (selectedMonthlyBudgetRowId = null)}
        class="text-sm font-semibold text-accent-600 hover:text-accent-800"
      >
        Clear
      </button>
    </div>

    <TransactionTable
      useSgdAmounts
      excludeGroups={[MONTHLY_BUDGET_TRAVEL_GROUP]}
      showStatusFilter={false}
      showDateFilter={false}
      editable
      year={monthlyBudgetYear}
      month={Number(monthlyBudgetMonth)}
      categoryLabels={selectedMonthlyBudgetRowCategories}
      bind:categoryFilter={monthlyTransactionCategoryFilter}
      title={`${selectedMonthlyBudgetRow.name} Transactions`}
      titleHighlight={selectedMonthlyBudgetRow.name}
    />
  {/if}

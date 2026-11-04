<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { currencyFormatter as formatter } from '../../lib/formatters';
  import {
    accumulateMonthlyBudgetNet,
    categoriesByMonthlyBudgetId,
    categoryBudgetIdMap,
  } from '../../lib/monthlyBudget';
  import TransactionTable from '../TransactionTable.svelte';
  import BudgetProgressBar from '../BudgetProgressBar.svelte';
  import YearlyBudgetSpendingChart from '../YearlyBudgetSpendingChart.svelte';

  // ---- Yearly Budget (configured in Settings → Budgets) ----
  const nowForYearlyBudget = new Date();
  let yearlyBudgetYear = $state(String(nowForYearlyBudget.getFullYear()));

  const yearlyBudgetYears = $derived.by(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    financeStore.transactions.forEach((transaction) => {
      if (Number.isNaN(transaction.date.getTime())) return;
      set.add(String(transaction.date.getFullYear()));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  });

  const yearlyBudgetCategoryLabels = $derived.by(() => {
    const byBudgetId = categoriesByMonthlyBudgetId(financeStore.categories);
    const map = new Map<string, string[]>();
    financeStore.yearlyBudgets.forEach((budget) => {
      const labels = byBudgetId.get(budget.id);
      if (labels) map.set(budget.id, labels);
    });
    return map;
  });

  const categoryMonthlyBudgetMap = $derived(categoryBudgetIdMap(financeStore.categories));

  const yearlyNetByBudgetId = $derived.by(() => {
    const year = Number(yearlyBudgetYear);
    const totals = new Map<string, number>();

    financeStore.yearlyBudgets.forEach((budget) => totals.set(budget.id, 0));
    accumulateMonthlyBudgetNet(
      totals,
      financeStore.transactions,
      categoryMonthlyBudgetMap,
      { year, excludeTravel: false }
    );

    return totals;
  });

  function yearlyRemaining(budgetId: string, amount: number): number {
    return amount - (yearlyNetByBudgetId.get(budgetId) ?? 0);
  }

  function yearlyProgress(budgetId: string, amount: number): number {
    if (amount <= 0) return 0;
    const net = yearlyNetByBudgetId.get(budgetId) ?? 0;
    if (net <= 0) return 0;
    return Math.min(100, Math.round((net / amount) * 100));
  }

  let selectedYearlyBudgetRowId = $state<string | null>(null);

  $effect(() => {
    const budgets = financeStore.yearlyBudgets;
    if (budgets.length === 0) {
      selectedYearlyBudgetRowId = null;
      return;
    }
    if (
      !selectedYearlyBudgetRowId ||
      !budgets.some((budget) => budget.id === selectedYearlyBudgetRowId)
    ) {
      selectedYearlyBudgetRowId = budgets[0].id;
    }
  });

  const selectedYearlyBudgetRow = $derived(
    financeStore.yearlyBudgets.find((budget) => budget.id === selectedYearlyBudgetRowId) ?? null
  );

  const selectedYearlyBudgetRowCategories = $derived(
    selectedYearlyBudgetRowId
      ? (yearlyBudgetCategoryLabels.get(selectedYearlyBudgetRowId) ?? [])
      : []
  );

  function toggleYearlyBudgetRow(budgetId: string) {
    if (selectedYearlyBudgetRowId === budgetId) return;
    selectedYearlyBudgetRowId = budgetId;
  }

  let yearlyTransactionCategoryFilter = $state('All Categories');

  $effect(() => {
    yearlyBudgetYear;
    selectedYearlyBudgetRowId;
    yearlyTransactionCategoryFilter = 'All Categories';
  });

  function handleYearlyCategorySelect(category: string | null) {
    yearlyTransactionCategoryFilter = category ?? 'All Categories';
  }
</script>

  <div class="flex flex-wrap items-end justify-between gap-4 rounded-[20px] border border-gray-100 bg-surface px-6 py-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Filter</p>
      <p class="mt-1 text-sm text-gray-600">
        Showing data for <span class="font-semibold text-gray-800">{yearlyBudgetYear}</span>
      </p>
    </div>
    <div>
      <label for="yearly-budget-year" class="mb-1 block text-xs font-semibold text-gray-500">
        Year
      </label>
      <select
        id="yearly-budget-year"
        bind:value={yearlyBudgetYear}
        class="min-w-[120px] rounded-xl border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
      >
        {#each yearlyBudgetYears as year (year)}
          <option value={year}>{year}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="border-b border-gray-50 px-6 py-4">
      <h2 class="text-base font-bold text-gray-900">Yearly Budget</h2>
      <p class="text-sm text-gray-500">
        Track spending for <span class="font-semibold text-gray-700">{yearlyBudgetYear}</span>.
        Assign categories in <span class="font-semibold text-gray-700">Settings → Category Rules</span>;
        set yearly allocations in <span class="font-semibold text-gray-700">Settings → Budgets</span>.
      </p>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-[720px] w-full border-collapse text-left">
        <thead>
          <tr class="bg-gray-50/95 text-[13px] text-gray-500">
            <th class="px-6 py-4 font-semibold">Budget</th>
            <th class="px-6 py-4 font-semibold">Yearly Limit</th>
            <th class="px-6 py-4 font-semibold">Net Spend</th>
            <th class="px-6 py-4 font-semibold">Remaining</th>
            <th class="px-6 py-4 font-semibold w-[280px]">Progress</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          {#each financeStore.yearlyBudgets as budget (budget.id)}
            {@const net = yearlyNetByBudgetId.get(budget.id) ?? 0}
            {@const remaining = yearlyRemaining(budget.id, budget.amount)}
            {@const progress = yearlyProgress(budget.id, budget.amount)}
            {@const overBudget = budget.amount > 0 && remaining < 0}
            {@const labels = yearlyBudgetCategoryLabels.get(budget.id) ?? []}
            <tr
              class="transition-colors cursor-pointer hover:bg-gray-50/50 {selectedYearlyBudgetRowId === budget.id
                ? 'bg-accent-50/70 ring-1 ring-inset ring-accent-200'
                : ''}"
              onclick={() => toggleYearlyBudgetRow(budget.id)}
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleYearlyBudgetRow(budget.id);
                }
              }}
              tabindex="0"
              aria-selected={selectedYearlyBudgetRowId === budget.id}
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
                <BudgetProgressBar
                  percent={progress}
                  status={overBudget ? 'critical' : 'healthy'}
                  showLabel
                />
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                No yearly budgets configured. Add them in Settings → Budgets.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="border-b border-gray-50 px-6 py-4">
      <h2 class="text-base font-bold text-gray-900">Yearly Spending Trend</h2>
      <p class="text-sm text-gray-500">
        {#if selectedYearlyBudgetRow}
          Expense and income by category for <span class="font-semibold text-gray-700">{yearlyBudgetYear}</span>
          — <span class="font-semibold text-gray-700">{selectedYearlyBudgetRow.name}</span>.
        {:else}
          Select a yearly budget above to view spending by category.
        {/if}
      </p>
    </div>
    <div class="px-6 py-5">
      <YearlyBudgetSpendingChart
        budgetId={selectedYearlyBudgetRowId ?? ''}
        year={yearlyBudgetYear}
        selectedCategory={yearlyTransactionCategoryFilter === 'All Categories'
          ? null
          : yearlyTransactionCategoryFilter}
        onSelectCategory={handleYearlyCategorySelect}
      />
    </div>
  </div>

  {#if selectedYearlyBudgetRow}
    <div class="flex items-center justify-between rounded-xl border border-accent-100 bg-accent-50 px-4 py-2.5">
      <p class="text-sm font-semibold text-accent-700">
        Showing transactions included in net spending for {selectedYearlyBudgetRow.name} — {yearlyBudgetYear}
      </p>
    </div>

    <TransactionTable
      useSgdAmounts
      budgetNetEligible
      showStatusFilter={false}
      showDateFilter={false}
      editable
      year={yearlyBudgetYear}
      categoryLabels={selectedYearlyBudgetRowCategories}
      bind:categoryFilter={yearlyTransactionCategoryFilter}
      title={`${selectedYearlyBudgetRow.name} Transactions`}
      titleHighlight={selectedYearlyBudgetRow.name}
    />
  {/if}

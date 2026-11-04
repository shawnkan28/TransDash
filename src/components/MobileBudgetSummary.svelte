<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { currencyFormatter as formatter } from '../lib/formatters';
  import {
    accumulateMonthlyBudgetNet,
    applyOverspendSpillover,
    categoryBudgetIdMap,
    monthlyBudgetBarState,
    MONTHLY_BUDGET_TRAVEL_GROUP,
  } from '../lib/monthlyBudget';
  import BudgetProgressBar from './BudgetProgressBar.svelte';
  import MobileScheduledDue from './MobileScheduledDue.svelte';
  import MobileWeekEntries from './MobileWeekEntries.svelte';
  import MobileEntryListSheet from './MobileEntryListSheet.svelte';

  type BudgetMode = 'monthly' | 'yearly';

  let mode = $state<BudgetMode>('monthly');
  let selectedBudgetId = $state<string | null>(null);

  const now = new Date();
  const isYearly = $derived(mode === 'yearly');

  const categoryMonthlyBudgetMap = $derived(categoryBudgetIdMap(financeStore.categories));

  const budgets = $derived(
    isYearly ? financeStore.yearlyBudgets : financeStore.monthlyBudgets
  );

  /**
   * Yearly budgets count travel, monthly ones do not — the same split the
   * desktop Budget tabs use, so the two screens never disagree.
   */
  const periodFilter = $derived(
    isYearly
      ? { year: now.getFullYear(), excludeTravel: false }
      : { year: now.getFullYear(), month: now.getMonth() }
  );

  const netByBudgetId = $derived.by(() => {
    const totals = new Map<string, number>();
    budgets.forEach((budget) => totals.set(budget.id, 0));
    accumulateMonthlyBudgetNet(
      totals,
      financeStore.transactions,
      categoryMonthlyBudgetMap,
      periodFilter
    );
    return totals;
  });

  // Overspend is only redistributed within a month (covering budgets first,
  // then savings); yearly budgets have no savings bucket to drain.
  const effectiveNetByBudgetId = $derived(
    isYearly ? netByBudgetId : applyOverspendSpillover(financeStore.monthlyBudgets, netByBudgetId)
  );

  const rows = $derived(
    budgets.map((budget) => {
      const spent = effectiveNetByBudgetId.get(budget.id) ?? 0;
      const ownSpent = netByBudgetId.get(budget.id) ?? 0;
      const limit = budget.amount;
      const isSavings = 'isSavings' in budget && budget.isSavings === true;
      const bar = monthlyBudgetBarState({ amount: limit, isSavings }, spent);
      const spillover = spent - ownSpent;
      return {
        id: budget.id,
        title: budget.name,
        isSavings,
        spent,
        limit,
        left: limit - spent,
        progress: bar.percent,
        status: bar.status,
        spillover,
      };
    })
  );

  const periodLabel = $derived(
    isYearly
      ? String(now.getFullYear())
      : now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  );

  /** Mirrors the accumulator's rules, so the list adds up to the figure above it. */
  const entriesByBudgetId = $derived.by(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const map = new Map<string, typeof financeStore.transactions>();

    budgets.forEach((budget) => map.set(budget.id, []));

    financeStore.transactions.forEach((transaction) => {
      if (!transaction.affectCashFlow) return;
      if (!isYearly && transaction.categoryGroup === MONTHLY_BUDGET_TRAVEL_GROUP) return;
      if (Number.isNaN(transaction.date.getTime())) return;
      if (transaction.date.getFullYear() !== year) return;
      if (!isYearly && transaction.date.getMonth() !== month) return;

      const budgetId = categoryMonthlyBudgetMap.get(transaction.category);
      if (!budgetId || !map.has(budgetId)) return;
      map.get(budgetId)!.push(transaction);
    });

    return map;
  });

  const selectedBudgetTitle = $derived(
    rows.find((row) => row.id === selectedBudgetId)?.title ?? ''
  );

  const selectedBudgetEntries = $derived(
    selectedBudgetId ? (entriesByBudgetId.get(selectedBudgetId) ?? []) : []
  );

  function setMode(next: BudgetMode) {
    // The open sheet belongs to the other period's budget, so it closes with it.
    selectedBudgetId = null;
    mode = next;
  }
</script>

<div class="space-y-3 pb-24">
  <div>
    <h1 class="text-2xl font-bold text-gray-900">Budget</h1>
    <p class="text-sm text-gray-500">{periodLabel}</p>
  </div>

  <div class="flex rounded-2xl border border-gray-200 bg-surface p-1 text-sm font-semibold">
    <button
      type="button"
      onclick={() => setMode('monthly')}
      aria-pressed={!isYearly}
      class="flex-1 rounded-xl py-2 transition-colors {isYearly
        ? 'text-gray-500 active:bg-gray-50'
        : 'bg-accent-600 text-white'}"
    >
      Monthly
    </button>
    <button
      type="button"
      onclick={() => setMode('yearly')}
      aria-pressed={isYearly}
      class="flex-1 rounded-xl py-2 transition-colors {isYearly
        ? 'bg-accent-600 text-white'
        : 'text-gray-500 active:bg-gray-50'}"
    >
      Yearly
    </button>
  </div>

  <MobileScheduledDue />

  <MobileWeekEntries />

  {#each rows as row (row.id)}
    <!-- Savings budgets are derived from other budgets' overspend rather than
         from entries of their own, so there is no entry list worth opening. -->
    <button
      type="button"
      disabled={row.isSavings}
      onclick={() => (selectedBudgetId = row.id)}
      class="w-full rounded-2xl border border-gray-100 bg-surface p-4 text-left shadow-sm transition-colors {row.isSavings
        ? ''
        : 'active:bg-gray-50'}"
    >
      <div class="flex items-baseline justify-between gap-3">
        <p class="font-semibold text-gray-900">{row.title}</p>
        <p class="text-sm font-semibold {row.left < 0 ? 'text-rose-500' : 'text-emerald-500'}">
          {formatter.format(row.left)} left
        </p>
      </div>

      <div class="mt-3">
        <BudgetProgressBar percent={row.progress} status={row.status} />
      </div>

      <p class="mt-2 text-xs text-gray-500">
        <span class="font-medium text-gray-700">{formatter.format(row.spent)}</span>
        spent of {formatter.format(row.limit)}
      </p>
      {#if row.spillover >= 0.005}
        <p class="mt-1 text-xs text-amber-600">
          Includes {formatter.format(row.spillover)} overspend from other budgets
        </p>
      {/if}
    </button>
  {/each}

  {#if rows.length === 0}
    <p class="rounded-2xl border border-gray-100 bg-surface p-6 text-center text-sm text-gray-500">
      No {isYearly ? 'yearly' : 'monthly'} budgets configured yet.
    </p>
  {/if}
</div>

<MobileEntryListSheet
  open={selectedBudgetId !== null}
  title={selectedBudgetTitle}
  transactions={selectedBudgetEntries}
  emptyMessage={`No entries counted toward this budget this ${isYearly ? 'year' : 'month'}.`}
  onClose={() => (selectedBudgetId = null)}
/>

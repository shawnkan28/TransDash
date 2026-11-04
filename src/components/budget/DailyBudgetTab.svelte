<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { currencyFormatter as formatter } from '../../lib/formatters';
  import { transactionValueInSGD } from '../../lib/currency';
  import { DAILY_BUDGET_YEAR, DAILY_GROUP, TRAVEL_GROUP } from '../../lib/budgetGroups';
  import { Save } from 'lucide-svelte';
  import TransactionTable from '../TransactionTable.svelte';
  import MonthlyExpenseChart from '../MonthlyExpenseChart.svelte';

  // ---- Daily Spendings ----
  let dailyBudgetInput = $state('');
  let isSavingDaily = $state(false);
  let monthlyChartYear = $state(String(new Date().getFullYear()));
  let selectedMonthKey = $state<string | null>(null);

  // Clear the month selection whenever the year filter changes.
  $effect(() => {
    monthlyChartYear;
    selectedMonthKey = null;
  });

  const selectedMonth = $derived.by(() => {
    if (!selectedMonthKey) return null;
    const [y, m] = selectedMonthKey.split('-').map(Number);
    return {
      year: String(y),
      monthIndex: m - 1,
      label: new Date(y, m - 1, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    };
  });

  const monthlyYears = $derived.by(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    financeStore.transactions.forEach((transaction) => {
      if (transaction.transactionType !== 'Expense' || !transaction.affectCashFlow) return;
      if (Number.isNaN(transaction.date.getTime())) return;
      set.add(`${transaction.date.getFullYear()}`);
    });
    return ['All Years', ...Array.from(set).sort((a, b) => b.localeCompare(a))];
  });

  function dayKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  const savedDailyBudget = $derived.by(() => {
    const record = financeStore.budgets.find(
      (budget) => budget.group === DAILY_GROUP && budget.year === DAILY_BUDGET_YEAR
    );
    return record?.amount ?? 0;
  });

  $effect(() => {
    dailyBudgetInput = savedDailyBudget > 0 ? String(savedDailyBudget) : '';
  });

  // Total cash-flow expenses (SGD) per calendar day.
  const dailySpend = $derived.by(() => {
    const map = new Map<string, number>();

    financeStore.transactions.forEach((transaction) => {
      if (transaction.transactionType !== 'Expense' || !transaction.affectCashFlow) return;
      if (transaction.categoryGroup === TRAVEL_GROUP) return;
      if (Number.isNaN(transaction.date.getTime())) return;

      const key = dayKey(transaction.date);
      map.set(key, (map.get(key) ?? 0) + transactionValueInSGD(transaction));
    });

    return map;
  });

  const dailySummary = $derived.by(() => {
    const now = new Date();
    const todayKey = dayKey(now);
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

    let today = 0;
    let week = 0;
    let month = 0;
    let total = 0;

    dailySpend.forEach((amount, key) => {
      const [y, m, d] = key.split('-').map(Number);
      const date = new Date(y, m - 1, d);

      total += amount;
      if (key === todayKey) today += amount;
      if (date >= sevenDaysAgo) week += amount;
      if (y === now.getFullYear() && m - 1 === now.getMonth()) month += amount;
    });

    const days = dailySpend.size;
    return { today, week, month, avg: days > 0 ? total / days : 0 };
  });

  async function saveDailyBudget() {
    isSavingDaily = true;
    try {
      const amount = Number.parseFloat(dailyBudgetInput);

      await db.budgets.where('group').equals(DAILY_GROUP).delete();
      if (Number.isFinite(amount) && amount > 0) {
        await db.budgets.put({
          id: `${DAILY_GROUP}-${DAILY_BUDGET_YEAR}`,
          group: DAILY_GROUP,
          year: DAILY_BUDGET_YEAR,
          amount,
        });
      }
      await financeStore.persistAppSettings();
      await financeStore.loadData();
      alert('Daily budget saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save daily budget.');
    }
    isSavingDaily = false;
  }
</script>

  <div class="rounded-[20px] border border-gray-100 bg-surface p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 class="text-base font-bold text-gray-900">Daily Budget</h2>
        <p class="text-sm text-gray-500">
          Set a target daily spend. Days above this amount are flagged as over budget.
        </p>
      </div>
      <div class="flex items-end gap-3">
        <div>
          <label for="daily-budget" class="mb-1 block text-xs font-semibold text-gray-500">
            Budget per day
          </label>
          <div class="relative w-40">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              id="daily-budget"
              type="number"
              step="0.01"
              min="0"
              bind:value={dailyBudgetInput}
              placeholder="0.00"
              class="w-full rounded-xl border border-gray-200 py-2 pl-7 pr-3 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
        </div>
        <button
          type="button"
          onclick={saveDailyBudget}
          disabled={isSavingDaily}
          class="flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} />
          {isSavingDaily ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
    <div class="rounded-[20px] border border-gray-100 bg-surface p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Today</p>
      <p class="mt-2 text-2xl font-bold text-gray-900">{formatter.format(dailySummary.today)}</p>
    </div>
    <div class="rounded-[20px] border border-gray-100 bg-surface p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Last 7 Days</p>
      <p class="mt-2 text-2xl font-bold text-gray-900">{formatter.format(dailySummary.week)}</p>
    </div>
    <div class="rounded-[20px] border border-gray-100 bg-surface p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">This Month</p>
      <p class="mt-2 text-2xl font-bold text-gray-900">{formatter.format(dailySummary.month)}</p>
    </div>
    <div class="rounded-[20px] border border-gray-100 bg-surface p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Avg / Day</p>
      <p class="mt-2 text-2xl font-bold text-gray-900">{formatter.format(dailySummary.avg)}</p>
    </div>
  </div>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="flex flex-col gap-3 border-b border-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-base font-bold text-gray-900">Monthly Expense</h2>
        <p class="text-sm text-gray-500">Total cash-flow expenses per month.</p>
      </div>
      <select
        bind:value={monthlyChartYear}
        aria-label="Filter monthly expense by year"
        class="self-start rounded-xl border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
      >
        {#each monthlyYears as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </div>
    <div class="px-6 py-5">
      <MonthlyExpenseChart
        year={monthlyChartYear === 'All Years' ? null : monthlyChartYear}
        selectedKey={selectedMonthKey}
        onSelectMonth={(key) => (selectedMonthKey = key)}
        excludeGroups={[TRAVEL_GROUP]}
      />
    </div>
  </div>

  {#if selectedMonth}
    <div class="flex items-center justify-between rounded-xl border border-accent-100 bg-accent-50 px-4 py-2.5">
      <p class="text-sm font-semibold text-accent-700">
        Showing transactions for {selectedMonth.label}
      </p>
      <button
        type="button"
        onclick={() => (selectedMonthKey = null)}
        class="text-sm font-semibold text-accent-600 hover:text-accent-800"
      >
        Clear
      </button>
    </div>
  {/if}

  <TransactionTable
    useSgdAmounts
    expensesOnly
    excludeGroups={[TRAVEL_GROUP]}
    showStatusFilter={false}
    showDateFilter={false}
    editable
    year={selectedMonth ? selectedMonth.year : null}
    month={selectedMonth ? selectedMonth.monthIndex : null}
    title={selectedMonth ? `${selectedMonth.label} Transactions` : 'Recent Transactions'}
  />

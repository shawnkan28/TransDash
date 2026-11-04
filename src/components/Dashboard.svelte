<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { transactionValueInSGD } from '../lib/currency';
  import StatCard from './StatCard.svelte';
  import SpendingChart from './SpendingChart.svelte';
  import YearlyCashFlowChart from './YearlyCashFlowChart.svelte';
  import YearlyStaticExpensesChart from './YearlyStaticExpensesChart.svelte';
  import MonthlyCashFlowChart from './MonthlyCashFlowChart.svelte';
  import TransactionTable from './TransactionTable.svelte';
  import { getCategoryBreakdown } from '../lib/categoryBreakdown';
  import { Sparkles, Wallet, ArrowDownLeft, ArrowUpRight } from 'lucide-svelte';

  let selectedYear = $state<string | null>(null);
  let selectedCategory = $state<string | null>(null);
  let selectedMonth = $state<number | null>(null);
  let breakdownSource = $state<'category' | 'month'>('category');
  let spreadTravelExpenses = $state(true);
  let yearInitialized = false;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const categoryBreakdown = $derived(getCategoryBreakdown(financeStore.transactions, selectedYear));

  const selectedCategoryGroups = $derived.by(() => {
    if (!selectedCategory) return null;
    return categoryBreakdown.find((s) => s.label === selectedCategory)?.groups ?? null;
  });

  $effect(() => {
    if (yearInitialized || financeStore.loading || financeStore.transactions.length === 0) return;

    selectedYear = String(
      Math.max(...financeStore.transactions.map((t) => t.date.getFullYear()))
    );
    yearInitialized = true;
  });

  function handleYearSelect(year: string | null) {
    selectedMonth = null;
    breakdownSource = 'category';
    selectedYear = year;
    selectedCategory =
      getCategoryBreakdown(financeStore.transactions, year)[0]?.label ?? null;
  }

  $effect(() => {
    if (financeStore.loading || financeStore.transactions.length === 0) return;

    financeStore.transactions;

    selectedMonth = null;
    breakdownSource = 'category';
    const top = getCategoryBreakdown(financeStore.transactions, selectedYear)[0]?.label ?? null;
    selectedCategory = top;
  });

  const breakdownTitleHighlight = $derived.by(() => {
    if (breakdownSource === 'month' && selectedMonth !== null && selectedYear) {
      return `${MONTHS[selectedMonth]} ${selectedYear}`;
    }
    if (selectedCategory) {
      return `${selectedCategory}${selectedYear ? ` (${selectedYear})` : ''}`;
    }
    return null;
  });

  const showBreakdownTable = $derived(
    breakdownSource === 'month'
      ? selectedMonth !== null && selectedYear !== null
      : selectedCategory !== null && selectedCategoryGroups !== null
  );

  const totals = $derived.by(() => {
    let income = 0;
    let expense = 0;

    financeStore.transactions.forEach((tx) => {
      if (!tx.affectCashFlow) return;
      const sgdValue = transactionValueInSGD(tx);
      if (tx.transactionType === 'Income') income += sgdValue;
      if (tx.transactionType === 'Expense') expense += sgdValue;
    });

    return { income, expense, balance: income - expense };
  });
</script>

<div class="space-y-6">
  <h1 class="text-[28px] font-bold text-gray-900 tracking-tight">Dashboard</h1>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <StatCard title="Final Balance" value={totals.balance} trend={12.5} icon={Wallet} />
    <StatCard title="Total Income" value={totals.income} trend={15.5} icon={ArrowDownLeft} />
    <StatCard title="Total Expenses" value={totals.expense} trend={-8.5} icon={ArrowUpRight} />
  </div>

  <div class="space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="md:col-span-2 bg-surface rounded-[20px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-bold text-gray-900">Yearly Cash Flow</h3>
          <button disabled aria-label="View yearly cash flow details" class="p-1.5 border border-gray-200 text-gray-500 rounded-lg opacity-50 cursor-not-allowed">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="h-72">
          <YearlyCashFlowChart bind:selectedYear onYearSelect={handleYearSelect} />
        </div>
      </div>

      <div class="bg-surface rounded-[20px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-bold text-gray-900">Spending Habits</h3>
          <button disabled aria-label="View yearly bills details" class="p-1.5 border border-gray-200 text-gray-500 rounded-lg opacity-50 cursor-not-allowed">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="h-72">
          <YearlyStaticExpensesChart spreadTravel={spreadTravelExpenses} />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-surface rounded-[20px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-base font-bold text-gray-900">
            Category Breakdown {#if selectedYear}<span class="text-accent-600"> ({selectedYear})</span>{:else}<span class="text-gray-400 font-medium"> (All years)</span>{/if}
          </h3>
          <button disabled aria-label="View category breakdown details" class="p-1.5 border border-gray-200 text-gray-500 rounded-lg opacity-50 cursor-not-allowed">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div class="h-64 relative">
          <SpendingChart year={selectedYear} bind:selectedCategory bind:breakdownSource />
        </div>
      </div>

      <div class="bg-surface rounded-[20px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <h3 class="text-base font-bold text-gray-900">
            Monthly Cash Flow {#if selectedYear}<span class="text-accent-600"> ({selectedYear})</span>{:else}<span class="text-gray-400 font-medium"> (Select a year)</span>{/if}
          </h3>
          <div class="flex items-center rounded-xl border border-gray-200 p-1 bg-gray-50 self-start">
            <button
              type="button"
              onclick={() => (spreadTravelExpenses = false)}
              class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {spreadTravelExpenses
                ? 'text-gray-600 hover:text-gray-900'
                : 'bg-surface text-accent-600 shadow-sm'}"
            >
              Actual
            </button>
            <button
              type="button"
              onclick={() => (spreadTravelExpenses = true)}
              class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer {spreadTravelExpenses
                ? 'bg-surface text-accent-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'}"
            >
              Spread Travel
            </button>
          </div>
        </div>
        <div class="h-64 relative">
          <MonthlyCashFlowChart
            year={selectedYear}
            spreadTravel={spreadTravelExpenses}
            bind:selectedMonth
            bind:selectedCategory
            bind:breakdownSource
          />
        </div>
      </div>
    </div>

    {#if showBreakdownTable}
      <TransactionTable
        year={selectedYear}
        categoryGroups={breakdownSource === 'category' ? selectedCategoryGroups : null}
        month={breakdownSource === 'month' ? selectedMonth : null}
        title="Breakdown Transactions"
        titleHighlight={breakdownTitleHighlight}
        showFilters={false}
        useSgdAmounts={true}
      />
    {/if}
  </div>

  <div class="relative">
    <div class="bg-gradient-to-br from-[#38bdf8] to-accent-700 rounded-[20px] p-6 text-white relative overflow-hidden opacity-30 grayscale filter pointer-events-none">
      <div class="absolute right-0 top-0 opacity-10">
        <Sparkles size={160} class="translate-x-1/3 -translate-y-1/4" />
      </div>
      <div class="flex items-center gap-2 mb-4 relative z-10">
        <div class="bg-white/20 p-1.5 rounded-lg">
          <Sparkles size={16} fill="currentColor" />
        </div>
        <span class="font-bold text-sm">AI Insight</span>
      </div>
      <p class="text-sm text-accent-50 leading-relaxed mb-6 relative z-10">
        You have saved $1,200 this month. Based on your spending habits, allocating an additional 5% to savings can help you reach your financial goal faster.
      </p>
      <button disabled class="bg-surface text-accent-600 px-4 py-2.5 rounded-xl text-xs font-bold w-auto inline-flex items-center gap-1 relative z-10 opacity-50 cursor-not-allowed">
        Auto Save Now
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div class="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
      <div class="bg-surface/90 backdrop-blur-sm text-gray-700 font-bold px-4 py-2.5 rounded-xl text-sm shadow-sm border border-gray-200 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        In Development
      </div>
    </div>
  </div>
</div>


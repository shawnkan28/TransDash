<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { currencyFormatter as formatter } from '../../lib/formatters';
  import { transactionValueInSGD } from '../../lib/currency';
  import { TRAVEL_GROUP, UNASSIGNED_TRIP } from '../../lib/budgetGroups';
  import { Save, ChevronRight } from 'lucide-svelte';
  import TransactionTable from '../TransactionTable.svelte';
  import BudgetProgressBar from '../BudgetProgressBar.svelte';

  let budgetInputs = $state<Record<number, string>>({});
  let isSaving = $state(false);


  let expandedYears = $state<Record<number, boolean>>({});

  function toggleYear(year: number) {
    expandedYears = { ...expandedYears, [year]: !expandedYears[year] };
  }

  // Latest calendar year each named trip has any travel transaction in.
  // A trip that spans multiple years is attributed entirely to this year.
  const tripLatestYear = $derived.by(() => {
    const map = new Map<string, number>();

    financeStore.transactions.forEach((transaction) => {
      if (transaction.categoryGroup !== TRAVEL_GROUP) return;
      const trip = (transaction.tripName ?? '').trim();
      if (!trip) return;
      const year = transaction.date.getFullYear();
      if (Number.isNaN(year)) return;
      map.set(trip, Math.max(map.get(trip) ?? year, year));
    });

    return map;
  });

  // Net travel spend (SGD) per year, broken down by trip name.
  // Named trips roll up into their latest year; untagged spend stays in its
  // own calendar year.
  const travelTripsByYear = $derived.by(() => {
    const map = new Map<number, Map<string, number>>();

    financeStore.transactions.forEach((transaction) => {
      if (transaction.categoryGroup !== TRAVEL_GROUP) return;

      const calendarYear = transaction.date.getFullYear();
      if (Number.isNaN(calendarYear)) return;

      const value = transactionValueInSGD(transaction);
      const signed = transaction.transactionType === 'Income' ? -value : value;
      const tripName = (transaction.tripName ?? '').trim();
      const trip = tripName || UNASSIGNED_TRIP;
      const year = tripName ? (tripLatestYear.get(tripName) ?? calendarYear) : calendarYear;

      if (!map.has(year)) map.set(year, new Map());
      const inner = map.get(year)!;
      inner.set(trip, (inner.get(trip) ?? 0) + signed);
    });

    return map;
  });

  // Year totals derive from the consolidated trip breakdown so the sub-rows
  // always sum to the year's Spent figure.
  const travelSpendByYear = $derived.by(() => {
    const totals = new Map<number, number>();
    travelTripsByYear.forEach((trips, year) => {
      let sum = 0;
      trips.forEach((amount) => (sum += amount));
      totals.set(year, sum);
    });
    return totals;
  });

  function tripRowsFor(year: number): { trip: string; amount: number }[] {
    const inner = travelTripsByYear.get(year);
    if (!inner) return [];
    return Array.from(inner.entries())
      .map(([trip, amount]) => ({ trip, amount }))
      .sort((a, b) => {
        if (a.trip === UNASSIGNED_TRIP) return 1;
        if (b.trip === UNASSIGNED_TRIP) return -1;
        return b.amount - a.amount;
      });
  }

  const savedBudgetByYear = $derived.by(() => {
    const map = new Map<number, number>();
    financeStore.budgets
      .filter((budget) => budget.group === TRAVEL_GROUP)
      .forEach((budget) => map.set(budget.year, budget.amount));
    return map;
  });

  const years = $derived.by(() => {
    const set = new Set<number>();
    travelSpendByYear.forEach((_, year) => set.add(year));
    savedBudgetByYear.forEach((_, year) => set.add(year));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  });

  // Seed local inputs from saved budgets whenever the saved data changes.
  $effect(() => {
    const next: Record<number, string> = {};
    savedBudgetByYear.forEach((amount, year) => {
      next[year] = String(amount);
    });
    budgetInputs = next;
  });

  function budgetFor(year: number): number {
    return Number.parseFloat(budgetInputs[year] ?? '') || 0;
  }

  function remainingFor(year: number): number {
    return budgetFor(year) - (travelSpendByYear.get(year) ?? 0);
  }

  function progressFor(year: number): number {
    const budget = budgetFor(year);
    if (budget <= 0) return 0;
    const spent = travelSpendByYear.get(year) ?? 0;
    return Math.min(100, Math.round((spent / budget) * 100));
  }

  function handleBudgetInput(year: number, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    budgetInputs = { ...budgetInputs, [year]: value };
  }

  async function saveBudgets() {
    isSaving = true;
    try {
      const records = Object.entries(budgetInputs)
        .map(([year, raw]) => {
          const amount = Number.parseFloat(raw);
          const yearNumber = Number(year);
          return { year: yearNumber, amount };
        })
        .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
        .map((entry) => ({
          id: `${TRAVEL_GROUP}-${entry.year}`,
          group: TRAVEL_GROUP,
          year: entry.year,
          amount: entry.amount,
        }));

      await db.budgets.where('group').equals(TRAVEL_GROUP).delete();
      if (records.length > 0) {
        await db.budgets.bulkPut(records);
      }
      await financeStore.persistAppSettings();
      await financeStore.loadData();
      alert('Travel budget saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save travel budget.');
    }
    isSaving = false;
  }
</script>

  <div class="overflow-hidden rounded-[20px] border border-gray-100 bg-surface shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
    <div class="flex flex-col gap-4 border-b border-gray-50 px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-base font-bold text-gray-900">Yearly Travel Budget</h2>
        <p class="text-sm text-gray-500">
          Budget vs. actual spend for the <span class="font-semibold text-gray-700">Travel</span> category group.
        </p>
      </div>
      <button
        type="button"
        onclick={saveBudgets}
        disabled={isSaving}
        class="flex items-center gap-2 self-start rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-accent-200 transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save size={16} />
        {isSaving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-[860px] w-full border-collapse text-left">
        <thead>
          <tr class="bg-gray-50/95 text-[13px] text-gray-500">
            <th class="px-6 py-4 font-semibold">Year</th>
            <th class="px-6 py-4 font-semibold">Budget</th>
            <th class="px-6 py-4 font-semibold">Spent</th>
            <th class="px-6 py-4 font-semibold">Remaining</th>
            <th class="px-6 py-4 font-semibold w-[280px]">Progress</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          {#each years as year (year)}
            {@const spent = travelSpendByYear.get(year) ?? 0}
            {@const remaining = remainingFor(year)}
            {@const progress = progressFor(year)}
            {@const overBudget = budgetFor(year) > 0 && remaining < 0}
            <tr class="transition-colors hover:bg-gray-50/50">
              <td class="px-6 py-4 text-[14px] font-bold text-gray-900">
                <button
                  type="button"
                  onclick={() => toggleYear(year)}
                  class="flex items-center gap-1.5 text-gray-900 hover:text-accent-600 transition-colors"
                  aria-expanded={expandedYears[year] ? 'true' : 'false'}
                >
                  <ChevronRight
                    size={16}
                    class="text-gray-400 transition-transform {expandedYears[year] ? 'rotate-90' : ''}"
                  />
                  {year}
                </button>
              </td>
              <td class="px-6 py-4">
                <div class="relative w-40">
                  <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetInputs[year] ?? ''}
                    placeholder="0.00"
                    class="w-full rounded-xl border border-gray-200 py-2 pl-7 pr-3 text-sm font-semibold text-gray-700 transition-colors focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
                    oninput={(event) => handleBudgetInput(year, event)}
                  />
                </div>
              </td>
              <td class="px-6 py-4 text-[14px] font-bold text-rose-500">
                {formatter.format(spent)}
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
            {#if expandedYears[year]}
              {#each tripRowsFor(year) as tripRow (tripRow.trip)}
                <tr class="bg-gray-50/40 text-[13px]">
                  <td class="py-3 pl-14 pr-6 font-medium {tripRow.trip === UNASSIGNED_TRIP ? 'italic text-gray-400' : 'text-gray-600'}">
                    {tripRow.trip}
                  </td>
                  <td class="px-6 py-3 text-gray-400">—</td>
                  <td class="px-6 py-3 font-bold text-rose-500">{formatter.format(tripRow.amount)}</td>
                  <td class="px-6 py-3 text-gray-400">—</td>
                  <td class="px-6 py-3 text-gray-400">—</td>
                </tr>
              {:else}
                <tr class="bg-gray-50/40">
                  <td colspan="5" class="py-3 pl-14 pr-6 text-[13px] text-gray-400">
                    No travel transactions for this year.
                  </td>
                </tr>
              {/each}
            {/if}
          {:else}
            <tr>
              <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                No travel data yet. Set a budget for the current year to get started.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <TransactionTable
    categoryGroups={[TRAVEL_GROUP]}
    includeAllTypesForGroups
    useSgdAmounts
    editableTripName
    editable
    title="Travel Transactions"
    titleHighlight="Travel"
  />

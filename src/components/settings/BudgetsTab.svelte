<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { Plus, Trash2, Save } from 'lucide-svelte';
  import type { MonthlyBudget, YearlyBudget } from '../../lib/types';
  import { currencyFormatter as monthlySalaryFormatter } from '../../lib/formatters';
  import {
    computeBudgetAmountFromSalary,
    computeMonthlyBudgetsAnnualTotal,
    computeYearlyBudgetAmountFromPool,
    computeYearlyBudgetPool,
    computeYearlySalary,
    generateMonthlyBudgetId,
    generateYearlyBudgetId,
  } from '../../lib/monthlyBudget';

let monthlySalary = $state(financeStore.monthlySalary);

  let monthlyBudgets = $state<MonthlyBudget[]>(
    JSON.parse(JSON.stringify(financeStore.monthlyBudgets))
  );

  let yearlyBudgets = $state<YearlyBudget[]>(
    JSON.parse(JSON.stringify(financeStore.yearlyBudgets))
  );

  let isSavingBudgets = $state(false);

  const totalSalaryPercent = $derived(
    monthlyBudgets.reduce((sum, budget) => sum + (Number(budget.salaryPercent) || 0), 0)
  );

  const yearlySalaryPreview = $derived(computeYearlySalary(Number(monthlySalary) || 0));

  const monthlyBudgetsForPreview = $derived(
    monthlyBudgets.map((budget) => ({
      ...budget,
      amount: computeBudgetAmountFromSalary(
        Number(monthlySalary) || 0,
        Number(budget.salaryPercent) || 0
      ),
    }))
  );

  const monthlyBudgetsAnnualPreview = $derived(
    computeMonthlyBudgetsAnnualTotal(monthlyBudgetsForPreview)
  );

  const yearlyBudgetPoolPreview = $derived(
    computeYearlyBudgetPool(Number(monthlySalary) || 0, monthlyBudgetsForPreview)
  );

  const totalYearlyPoolPercent = $derived(
    yearlyBudgets.reduce((sum, budget) => sum + (Number(budget.poolPercent) || 0), 0)
  );

  const totalYearlyBudgetAllocated = $derived(
    yearlyBudgets.reduce(
      (sum, budget) =>
        sum + yearlyBudgetAmountPreview(Number(budget.poolPercent) || 0),
      0
    )
  );

  function budgetAmountPreview(salaryPercent: number): number {
    return computeBudgetAmountFromSalary(monthlySalary, salaryPercent);
  }

  function yearlyBudgetAmountPreview(poolPercent: number): number {
    return computeYearlyBudgetAmountFromPool(yearlyBudgetPoolPreview, poolPercent);
  }

  function addMonthlyBudget() {
    const nextOrder = monthlyBudgets.reduce(
      (max, budget) => Math.max(max, budget.order ?? 0),
      -1
    ) + 1;
    monthlyBudgets.push({
      id: generateMonthlyBudgetId(),
      name: 'New Budget',
      amount: 0,
      salaryPercent: 0,
      isSavings: false,
      order: nextOrder,
    });
  }

  function removeMonthlyBudget(index: number) {
    monthlyBudgets.splice(index, 1);
  }

  function addYearlyBudget() {
    yearlyBudgets.push({
      id: generateYearlyBudgetId(),
      name: 'New Yearly Budget',
      amount: 0,
      poolPercent: 0,
    });
  }

  function removeYearlyBudget(index: number) {
    yearlyBudgets.splice(index, 1);
  }

  async function saveBudgets() {
    const salary = Number(monthlySalary);
    if (!Number.isFinite(salary) || salary < 0) {
      alert('Enter a valid monthly salary.');
      return;
    }

    const trimmed = monthlyBudgets
      .map((budget, i) => {
        const salaryPercent = Number(budget.salaryPercent) || 0;
        const order = Number.isFinite(Number(budget.order)) ? Number(budget.order) : i;
        return {
          id: budget.id.trim(),
          name: budget.name.trim(),
          salaryPercent,
          amount: computeBudgetAmountFromSalary(salary, salaryPercent),
          isSavings: !!budget.isSavings,
          // Savings is where uncovered overspend ends up, so it never covers.
          coversOverspend: !budget.isSavings && !!budget.coversOverspend,
          order,
        };
      })
      .filter((budget) => budget.name);

    if (trimmed.length === 0) {
      alert('Add at least one monthly budget.');
      return;
    }

    const monthlyNames = trimmed.map((budget) => budget.name.toLowerCase());
    if (new Set(monthlyNames).size !== monthlyNames.length) {
      alert('Each monthly budget must have a unique name.');
      return;
    }

    const monthlyIds = trimmed.map((budget) => budget.id);
    if (new Set(monthlyIds).size !== monthlyIds.length) {
      alert('Each monthly budget must have a unique id.');
      return;
    }

    for (const budget of trimmed) {
      if (!Number.isFinite(budget.salaryPercent) || budget.salaryPercent < 0 || budget.salaryPercent > 100) {
        alert(`Invalid monthly percentage for "${budget.name}". Use a value between 0 and 100.`);
        return;
      }
    }

    const yearlyPool = computeYearlyBudgetPool(salary, trimmed);
    const trimmedYearly = yearlyBudgets
      .map((budget) => {
        const poolPercent = Number(budget.poolPercent) || 0;
        return {
          id: budget.id.trim(),
          name: budget.name.trim(),
          poolPercent,
          amount: computeYearlyBudgetAmountFromPool(yearlyPool, poolPercent),
        };
      })
      .filter((budget) => budget.name);

    const yearlyNames = trimmedYearly.map((budget) => budget.name.toLowerCase());
    if (new Set(yearlyNames).size !== yearlyNames.length) {
      alert('Each yearly budget must have a unique name.');
      return;
    }

    const yearlyIds = trimmedYearly.map((budget) => budget.id);
    if (new Set(yearlyIds).size !== yearlyIds.length) {
      alert('Each yearly budget must have a unique id.');
      return;
    }

    for (const budget of trimmedYearly) {
      if (!Number.isFinite(budget.poolPercent) || budget.poolPercent < 0 || budget.poolPercent > 100) {
        alert(`Invalid yearly percentage for "${budget.name}". Use a value between 0 and 100.`);
        return;
      }
    }

    const previousMonthlyIds = financeStore.monthlyBudgets.map((budget) => budget.id);
    const nextMonthlyIds = new Set(trimmed.map((budget) => budget.id));
    const removedMonthlyIds = previousMonthlyIds.filter((id) => !nextMonthlyIds.has(id));

    const previousYearlyIds = financeStore.yearlyBudgets.map((budget) => budget.id);
    const nextYearlyIds = new Set(trimmedYearly.map((budget) => budget.id));
    const removedYearlyIds = previousYearlyIds.filter((id) => !nextYearlyIds.has(id));
    const removedBudgetIds = [...removedMonthlyIds, ...removedYearlyIds];

    isSavingBudgets = true;
    try {
      await db.monthlyBudgetPlan.put({ id: 'default', monthlySalary: salary });
      await db.monthlyBudgets.bulkPut(trimmed);
      if (removedMonthlyIds.length > 0) {
        await db.monthlyBudgets.bulkDelete(removedMonthlyIds);
      }

      if (removedBudgetIds.length > 0) {
        const storedCategories = await db.categories.toArray();
        const clearedCategories = storedCategories.map((category) =>
          category.monthlyBudgetId && removedBudgetIds.includes(category.monthlyBudgetId)
            ? { ...category, monthlyBudgetId: '' }
            : category
        );
        await db.categories.bulkPut(clearedCategories);
      }

      await db.yearlyBudgets.bulkPut(trimmedYearly);
      if (removedYearlyIds.length > 0) {
        await db.yearlyBudgets.bulkDelete(removedYearlyIds);
      }

      await financeStore.persistAppSettings();
      await financeStore.loadData();
      monthlySalary = financeStore.monthlySalary;
      monthlyBudgets = JSON.parse(JSON.stringify(financeStore.monthlyBudgets));
      yearlyBudgets = JSON.parse(JSON.stringify(financeStore.yearlyBudgets));

      alert('Budget configuration saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save budget configuration.');
    }
    isSavingBudgets = false;
  }
</script>

  <div class="space-y-6">
    <div class="flex justify-end">
      <button onclick={saveBudgets} disabled={isSavingBudgets} class="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-xl hover:bg-accent-500 transition-colors shadow-sm shadow-accent-200 font-medium text-sm disabled:opacity-50">
        <Save size={16} />
        {isSavingBudgets ? 'Saving...' : 'Save Changes'}
      </button>
    </div>

  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-surface">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Monthly Budget Configuration</h2>
        <p class="text-sm text-gray-500 mt-1">
          Set your monthly salary, allocate a percentage to each budget, and assign categories in Category Rules.
        </p>
      </div>
      <button onclick={addMonthlyBudget} class="flex items-center gap-2 self-start px-4 py-2 bg-surface border border-accent-200 text-gray-700 rounded-xl hover:bg-accent-50 transition-colors shadow-sm font-medium text-sm">
        <Plus size={16} />
        Add Monthly Budget
      </button>
    </div>

    <div class="p-6 border-b border-accent-50">
      <label for="monthly-salary" class="mb-1 block text-xs font-semibold text-gray-500">
        Monthly Salary
      </label>
      <div class="relative w-full max-w-xs">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
        <input
          id="monthly-salary"
          type="number"
          step="0.01"
          min="0"
          bind:value={monthlySalary}
          placeholder="0.00"
          class="w-full rounded-lg border border-accent-200 py-2 pl-7 pr-3 text-sm font-semibold text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
        />
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse min-w-[780px]">
        <thead>
          <tr class="bg-accent-50/50 text-gray-500 text-sm">
            <th class="px-6 py-4 font-semibold">Order</th>
            <th class="px-6 py-4 font-semibold">Budget Name</th>
            <th class="px-6 py-4 font-semibold">Salary %</th>
            <th class="px-6 py-4 font-semibold">Monthly Amount</th>
            <th class="px-6 py-4 font-semibold">Type</th>
            <th class="px-6 py-4 font-semibold">
              Covers Overspend
              <span class="block text-[11px] font-normal text-gray-400">Used before Savings</span>
            </th>
            <th class="px-6 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-accent-50">
          {#each monthlyBudgets as budget, i (budget.id)}
            <tr class="hover:bg-accent-50/30 transition-colors align-top">
              <td class="px-6 py-3 align-top">
                <input
                  type="number"
                  step="1"
                  value={budget.order ?? i}
                  oninput={(event) => (budget.order = Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-16 rounded-lg border border-accent-200 px-2 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-6 py-3 align-top">
                <input
                  type="text"
                  bind:value={budget.name}
                  class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
                <p class="mt-1 text-[11px] leading-tight text-gray-400 font-mono">{budget.id}</p>
              </td>
              <td class="px-6 py-3 align-top">
                <div class="relative w-28">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    bind:value={budget.salaryPercent}
                    class="w-full rounded-lg border border-accent-200 py-1.5 pl-3 pr-7 text-sm font-semibold text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                  />
                  <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                </div>
              </td>
              <td class="px-6 py-3 align-top text-sm font-semibold text-gray-700">
                <span class="inline-block px-3 py-1.5">
                  {monthlySalaryFormatter.format(budgetAmountPreview(Number(budget.salaryPercent) || 0))}
                </span>
              </td>
              <td class="px-6 py-3 align-top">
                <div class="flex w-40 rounded-lg border border-accent-200 p-0.5">
                  <button
                    type="button"
                    onclick={() => (budget.isSavings = false)}
                    class="flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors {!budget.isSavings ? 'bg-accent-600 text-white' : 'text-gray-500 hover:bg-accent-50'}"
                  >
                    Not Savings
                  </button>
                  <button
                    type="button"
                    onclick={() => (budget.isSavings = true)}
                    class="flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors {budget.isSavings ? 'bg-accent-600 text-white' : 'text-gray-500 hover:bg-accent-50'}"
                  >
                    Savings
                  </button>
                </div>
              </td>
              <td class="px-6 py-3 align-top">
                <label class="inline-flex items-center gap-2 px-1 py-1.5 text-sm text-gray-600 {budget.isSavings ? 'opacity-40' : 'cursor-pointer'}">
                  <input
                    type="checkbox"
                    checked={!budget.isSavings && !!budget.coversOverspend}
                    disabled={budget.isSavings}
                    onchange={(event) => (budget.coversOverspend = (event.currentTarget as HTMLInputElement).checked)}
                    class="h-4 w-4 rounded accent-accent-600"
                  />
                  {budget.isSavings ? 'n/a' : 'Yes'}
                </label>
              </td>
              <td class="px-6 py-3 align-top text-right">
                <button onclick={() => removeMonthlyBudget(i)} class="inline-flex text-gray-400 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          {/each}
          {#if monthlyBudgets.length === 0}
            <tr>
              <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                No monthly budgets configured. Add one to get started.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    {#if monthlyBudgets.length > 0}
      <div class="border-t border-accent-50 px-6 py-4 text-sm text-gray-600">
        <span class="font-semibold text-gray-800">Total allocated:</span>
        {totalSalaryPercent.toFixed(2)}%
      </div>
    {/if}
  </div>

  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-surface">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Yearly Budget Configuration</h2>
        <p class="text-sm text-gray-500 mt-1">
          Allocate the remainder of your yearly salary after monthly budgets are annualized.
        </p>
      </div>
      <button onclick={addYearlyBudget} class="flex items-center gap-2 self-start px-4 py-2 bg-surface border border-accent-200 text-gray-700 rounded-xl hover:bg-accent-50 transition-colors shadow-sm font-medium text-sm">
        <Plus size={16} />
        Add Yearly Budget
      </button>
    </div>

    <div class="grid grid-cols-1 gap-4 border-b border-accent-50 p-6 sm:grid-cols-3">
      <div class="rounded-xl border border-accent-100 bg-accent-50/40 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Expected Yearly Salary</p>
        <p class="mt-2 text-xl font-bold text-gray-900">
          {monthlySalaryFormatter.format(yearlySalaryPreview)}
        </p>
        <p class="mt-1 text-xs text-gray-500">Monthly salary × 12</p>
      </div>
      <div class="rounded-xl border border-accent-100 bg-accent-50/40 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Monthly Budgets (×12)</p>
        <!-- Red because it is what gets taken off the yearly salary, matching
             the sign convention the tile beside it already uses. -->
        <p class="mt-2 text-xl font-bold text-rose-500">
          {monthlySalaryFormatter.format(monthlyBudgetsAnnualPreview)}
        </p>
        <p class="mt-1 text-xs text-gray-500">Sum of monthly amounts × 12</p>
      </div>
      <div class="rounded-xl border border-accent-100 bg-accent-50/40 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Available for Yearly Budgets</p>
        <p class="mt-2 text-xl font-bold {yearlyBudgetPoolPreview < 0 ? 'text-rose-500' : 'text-emerald-600'}">
          {monthlySalaryFormatter.format(yearlyBudgetPoolPreview)}
        </p>
        <p class="mt-1 text-xs text-gray-500">Yearly salary − monthly budgets (×12)</p>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse min-w-[640px]">
        <thead>
          <tr class="bg-accent-50/50 text-gray-500 text-sm">
            <th class="px-6 py-4 font-semibold">Budget Name</th>
            <th class="px-6 py-4 font-semibold">Pool %</th>
            <th class="px-6 py-4 font-semibold">Yearly Amount</th>
            <th class="px-6 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-accent-50">
          {#each yearlyBudgets as budget, i (budget.id)}
            <tr class="hover:bg-accent-50/30 transition-colors align-top">
              <td class="px-6 py-3 align-top">
                <input
                  type="text"
                  bind:value={budget.name}
                  class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
                <p class="mt-1 text-[11px] leading-tight text-gray-400 font-mono">{budget.id}</p>
              </td>
              <td class="px-6 py-3 align-top">
                <div class="relative w-28">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    bind:value={budget.poolPercent}
                    disabled={yearlyBudgetPoolPreview <= 0}
                    class="w-full rounded-lg border border-accent-200 py-1.5 pl-3 pr-7 text-sm font-semibold text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface disabled:cursor-not-allowed disabled:bg-gray-50"
                  />
                  <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                </div>
              </td>
              <td class="px-6 py-3 align-top text-sm font-semibold text-gray-700">
                <span class="inline-block px-3 py-1.5">
                  {monthlySalaryFormatter.format(yearlyBudgetAmountPreview(Number(budget.poolPercent) || 0))}
                </span>
              </td>
              <td class="px-6 py-3 align-top text-right">
                <button onclick={() => removeYearlyBudget(i)} class="inline-flex text-gray-400 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          {/each}
          {#if yearlyBudgets.length === 0}
            <tr>
              <td colspan="4" class="px-6 py-12 text-center text-gray-500">
                No yearly budgets configured. Add one to allocate your remaining yearly pool.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    {#if yearlyBudgets.length > 0}
      <div class="border-t border-accent-50 px-6 py-4 text-sm text-gray-600 space-y-1">
        <div>
          <span class="font-semibold text-gray-800">Pool allocated:</span>
          {totalYearlyPoolPercent.toFixed(2)}%
        </div>
        <div>
          <span class="font-semibold text-gray-800">Yearly budget total:</span>
          {monthlySalaryFormatter.format(totalYearlyBudgetAllocated)}
          {#if yearlyBudgetPoolPreview > 0}
            <span class="ml-2 text-gray-500">
              of {monthlySalaryFormatter.format(yearlyBudgetPoolPreview)} available
            </span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  </div>

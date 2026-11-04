<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { Plus, Trash2, Save } from 'lucide-svelte';
  import type { Category } from '../../lib/types';
  import { matchesSearchPattern } from '../../lib/search';
  import { buildBudgetOptions } from '../../lib/monthlyBudget';
  import CategoryRuleModal from '../CategoryRuleModal.svelte';

// Using clone mechanism to avoid mutating store state directly
  let categories = $state<Category[]>(
    JSON.parse(JSON.stringify(financeStore.categories)).map((category: Category) => ({
      ...category,
      monthlyBudgetId: category.monthlyBudgetId ?? '',
    }))
  );

  let categorySearch = $state('');

  let categoryBudgetFilter = $state('');

  let categoryAffectCashFlowFilter = $state('');

  let isSaving = $state(false);

  let categoryRuleModalOpen = $state(false);

  const categoryLabels = $derived(categories.map((category) => category.label));

  // Saved budgets only. This used to also merge the Budgets tab's in-progress
  // edits, which only ever worked because both tabs lived in one component.
  const budgetOptions = $derived(
    buildBudgetOptions(financeStore.monthlyBudgets, financeStore.yearlyBudgets)
  );

  const filteredCategories = $derived.by(() => {
    let result = categories;

    if (categoryBudgetFilter === '__none__') {
      result = result.filter((category) => !category.monthlyBudgetId);
    } else if (categoryBudgetFilter) {
      result = result.filter(
        (category) => category.monthlyBudgetId === categoryBudgetFilter
      );
    }

    if (categoryAffectCashFlowFilter === 'true') {
      result = result.filter((category) => category.affectCashFlow);
    } else if (categoryAffectCashFlowFilter === 'false') {
      result = result.filter((category) => !category.affectCashFlow);
    }

    const query = categorySearch.trim();
    if (!query) return result;

    return result.filter((category) => {
      const budgetName =
        budgetOptions.all.find((budget) => budget.id === category.monthlyBudgetId)?.name ??
        '';
      return (
        matchesSearchPattern(category.label, query) ||
        matchesSearchPattern(category.categoryGroup, query) ||
        matchesSearchPattern(category.transactionType, query) ||
        matchesSearchPattern(budgetName, query)
      );
    });
  });

  function openCategoryRuleModal() {
    categoryRuleModalOpen = true;
  }

  function handleAddCategory(category: Category) {
    categories = [...categories, category].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }

  function removeCategory(label: string) {
    categories = categories.filter((category) => category.label !== label);
  }

  async function saveCategories() {
    isSaving = true;
    try {
      const records = categories.map((category) => ({
        label: category.label,
        transactionType: category.transactionType,
        categoryGroup: category.categoryGroup,
        affectCashFlow: category.affectCashFlow,
        monthlyBudgetId: category.monthlyBudgetId || '',
      }));
      await db.categories.clear();
      await db.categories.bulkPut(records);
      await financeStore.persistAppSettings();
      await financeStore.loadData();
      categories = financeStore.categories.map((category) => ({
        ...category,
        monthlyBudgetId: category.monthlyBudgetId ?? '',
      }));
      alert('Categories saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save categories.');
    }
    isSaving = false;
  }
</script>

  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-surface">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Category Configuration</h2>
        <p class="text-sm text-gray-500 mt-1">
          Manage mapping rules for your transactions. Assign a monthly budget to each category label.
        </p>
      </div>
      <div class="flex gap-3">
        <button onclick={openCategoryRuleModal} class="flex items-center gap-2 px-4 py-2 bg-surface border border-accent-200 text-gray-700 rounded-xl hover:bg-accent-50 transition-colors shadow-sm font-medium text-sm">
          <Plus size={16} />
          Add Rule
        </button>
        <button onclick={saveCategories} disabled={isSaving} class="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-xl hover:bg-accent-500 transition-colors shadow-sm shadow-accent-200 font-medium text-sm disabled:opacity-50">
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>

    <div class="p-6 border-b border-accent-50 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div class="flex-1 max-w-xs">
        <label for="category-search" class="mb-1 block text-xs font-semibold text-gray-500">
          Search
        </label>
        <input
          id="category-search"
          type="text"
          bind:value={categorySearch}
          placeholder="Search categories..."
          autocomplete="off"
          spellcheck="false"
          class="w-full px-3 py-2 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
        />
      </div>
      <div class="flex-1 max-w-xs">
        <label for="category-budget-filter" class="mb-1 block text-xs font-semibold text-gray-500">
          Budget
        </label>
        <select
          id="category-budget-filter"
          bind:value={categoryBudgetFilter}
          class="w-full px-3 py-2 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface text-sm font-medium text-gray-700"
        >
          <option value="">All budgets</option>
          <option value="__none__">— None —</option>
          {#if budgetOptions.monthly.length > 0}
            <optgroup label="Monthly">
              {#each budgetOptions.monthly as budget (budget.id)}
                <option value={budget.id}>{budget.name}</option>
              {/each}
            </optgroup>
          {/if}
          {#if budgetOptions.yearly.length > 0}
            <optgroup label="Yearly">
              {#each budgetOptions.yearly as budget (budget.id)}
                <option value={budget.id}>{budget.name}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </div>
      <div class="flex-1 max-w-xs">
        <label for="category-affect-cash-flow-filter" class="mb-1 block text-xs font-semibold text-gray-500">
          Affect Cash Flow
        </label>
        <select
          id="category-affect-cash-flow-filter"
          bind:value={categoryAffectCashFlowFilter}
          class="w-full px-3 py-2 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface text-sm font-medium text-gray-700"
        >
          <option value="">All</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse min-w-[820px]">
        <thead>
          <tr class="bg-accent-50/50 text-gray-500 text-sm">
            <th class="px-6 py-4 font-semibold">Category Label (Matches CSV)</th>
            <th class="px-6 py-4 font-semibold">Budget</th>
            <th class="px-6 py-4 font-semibold">Transaction Type</th>
            <th class="px-6 py-4 font-semibold">Category Group</th>
            <th class="px-6 py-4 font-semibold text-center">Affect Cash Flow</th>
            <th class="px-6 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-accent-50">
          {#each filteredCategories as cat (cat.label)}
            <tr class="hover:bg-accent-50/30 transition-colors">
              <td class="px-6 py-3">
                <input type="text" bind:value={cat.label} class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface" />
              </td>
              <td class="px-6 py-3">
                <select
                  bind:value={cat.monthlyBudgetId}
                  class="w-full min-w-[140px] px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                >
                  <option value="">— None —</option>
                  {#if budgetOptions.monthly.length > 0}
                    <optgroup label="Monthly">
                      {#each budgetOptions.monthly as budget (budget.id)}
                        <option value={budget.id}>{budget.name}</option>
                      {/each}
                    </optgroup>
                  {/if}
                  {#if budgetOptions.yearly.length > 0}
                    <optgroup label="Yearly">
                      {#each budgetOptions.yearly as budget (budget.id)}
                        <option value={budget.id}>{budget.name}</option>
                      {/each}
                    </optgroup>
                  {/if}
                  {#if cat.monthlyBudgetId && !budgetOptions.all.some((budget) => budget.id === cat.monthlyBudgetId)}
                    <option value={cat.monthlyBudgetId}>{cat.monthlyBudgetId}</option>
                  {/if}
                </select>
              </td>
              <td class="px-6 py-3">
                <select bind:value={cat.transactionType} class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface">
                  <option value="Expense">Expense</option>
                  <option value="Income">Income</option>
                </select>
              </td>
              <td class="px-6 py-3">
                <input type="text" bind:value={cat.categoryGroup} class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface" />
              </td>
              <td class="px-6 py-3 text-center">
                <input type="checkbox" bind:checked={cat.affectCashFlow} class="w-4 h-4 text-accent-600 rounded border-accent-300 focus:ring-accent-600 bg-surface" />
              </td>
              <td class="px-6 py-3 text-right">
                <button onclick={() => removeCategory(cat.label)} class="text-gray-400 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          {/each}
          {#if filteredCategories.length === 0}
            <tr>
              <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                {#if categories.length === 0}
                  No category mappings found. Add a rule to start mapping.
                {:else}
                  No categories match your current filters.
                {/if}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <CategoryRuleModal
    open={categoryRuleModalOpen}
    existingLabels={categoryLabels}
    budgetOptions={budgetOptions}
    onClose={() => (categoryRuleModalOpen = false)}
    onAdd={handleAddCategory}
  />

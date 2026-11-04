<script lang="ts">
  import BudgetCategoryBarChart from './BudgetCategoryBarChart.svelte';

  let {
    budgetId = '',
    year = String(new Date().getFullYear()),
    selectedCategory = null,
    onSelectCategory = undefined,
  }: {
    budgetId?: string;
    year?: string;
    selectedCategory?: string | null;
    onSelectCategory?: (category: string | null) => void;
  } = $props();
</script>

<BudgetCategoryBarChart
  {budgetId}
  {year}
  {selectedCategory}
  {onSelectCategory}
/>

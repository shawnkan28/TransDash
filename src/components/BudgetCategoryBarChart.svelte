<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import type { ChartDataset } from 'chart.js';
  import { financeStore } from '../lib/store.svelte';
  import { formatCompactSGD } from '../lib/currency';
  import { buildBudgetCategorySeries } from '../lib/monthlyBudget';

  let {
    budgetId = '',
    year = String(new Date().getFullYear()),
    month = null,
    selectedCategory = null,
    onSelectCategory = undefined,
  }: {
    budgetId?: string;
    year?: string;
    month?: number | null;
    selectedCategory?: string | null;
    onSelectCategory?: (category: string | null) => void;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  const series = $derived.by(() => {
    const yearNum = Number(year);
    if (!budgetId || !Number.isFinite(yearNum)) {
      return { labels: [] as string[], expenses: [] as number[], income: [] as number[] };
    }

    const categoryBudgetMap = new Map<string, string>();
    financeStore.categories.forEach((category) => {
      if (category.monthlyBudgetId) {
        categoryBudgetMap.set(category.label, category.monthlyBudgetId);
      }
    });

    return buildBudgetCategorySeries(
      financeStore.transactions,
      categoryBudgetMap,
      budgetId,
      yearNum,
      month ?? undefined
    );
  });

  const hasData = $derived(series.labels.length > 0);

  function expenseBarColors(labels: string[], selected: string | null): string[] {
    return labels.map((label) =>
      selected === label ? '#be123c' : '#d2475f'
    );
  }

  function incomeBarColors(labels: string[], selected: string | null): string[] {
    return labels.map((label) =>
      selected === label ? '#047857' : '#10b981'
    );
  }

  $effect(() => {
    if (!canvas) return;

    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Expense',
            data: [],
            backgroundColor: '#d2475f',
            hoverBackgroundColor: '#e11d48',
            borderRadius: 6,
            maxBarThickness: 40,
          },
          {
            label: 'Income',
            data: [],
            backgroundColor: '#10b981',
            hoverBackgroundColor: '#059669',
            borderRadius: 6,
            maxBarThickness: 40,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 8 },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: $${formatCompactSGD(Number(ctx.raw))}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => `$${formatCompactSGD(Number(value))}`,
            },
            grid: {},
          },
          x: {
            grid: { display: false },
            ticks: {
              maxRotation: 45,
              minRotation: 0,
            },
          },
        },
      },
    });

    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  $effect(() => {
    if (!chart || !onSelectCategory) return;

    const currentSelection = selectedCategory;
    chart.options.onClick = (_event, elements) => {
      if (!elements.length) return;
      const label = chart?.data.labels?.[elements[0].index];
      if (typeof label !== 'string') return;
      onSelectCategory(currentSelection === label ? null : label);
    };
    chart.options.onHover = (event, elements) => {
      const target = event.native?.target as HTMLElement | undefined;
      if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
    };
  });

  $effect(() => {
    if (!chart) return;

    const expenseDataset = chart.data.datasets[0] as ChartDataset<'bar'>;
    const incomeDataset = chart.data.datasets[1] as ChartDataset<'bar'>;
    chart.data.labels = series.labels;
    expenseDataset.data = series.expenses;
    incomeDataset.data = series.income;
    expenseDataset.backgroundColor = expenseBarColors(series.labels, selectedCategory);
    incomeDataset.backgroundColor = incomeBarColors(series.labels, selectedCategory);
    chart.update();
  });
</script>

<div class="relative h-72">
  <canvas bind:this={canvas} class="h-full w-full"></canvas>
  {#if !budgetId}
    <div
      class="absolute inset-0 flex items-center justify-center bg-surface text-sm text-gray-500"
    >
      Select a budget to view spending by category.
    </div>
  {:else if !hasData}
    <div
      class="absolute inset-0 flex items-center justify-center bg-surface text-sm text-gray-500"
    >
      No category spending recorded for this budget yet.
    </div>
  {/if}
</div>

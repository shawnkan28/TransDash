<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import type { ChartConfiguration } from 'chart.js';
  import { financeStore } from '../lib/store.svelte';
  import { transactionValueInSGD, formatCompactSGD } from '../lib/currency';

  let { selectedYear = $bindable<string | null>(null), onYearSelect }: {
    selectedYear?: string | null;
    onYearSelect?: (year: string | null) => void;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart<'line'> | null = null;
  let hasInitialAnimation = false;

  const data = $derived.by(() => {
    const yearlyData = new Map<string, { income: number; expense: number }>();

    financeStore.transactions
      .filter((t) => t.affectCashFlow)
      .forEach((t) => {
        const year = `${t.date.getFullYear()}`;
        if (!yearlyData.has(year)) {
          yearlyData.set(year, { income: 0, expense: 0 });
        }

        const current = yearlyData.get(year)!;
        const sgdValue = transactionValueInSGD(t);
        if (t.transactionType === 'Income') current.income += sgdValue;
        if (t.transactionType === 'Expense') current.expense += sgdValue;
      });

    const sortedYears = Array.from(yearlyData.keys()).sort();

    return {
      labels: sortedYears,
      income: sortedYears.map((y) => yearlyData.get(y)!.income),
      expense: sortedYears.map((y) => yearlyData.get(y)!.expense),
      cashFlow: sortedYears.map((y) => {
        const { income, expense } = yearlyData.get(y)!;
        return income - expense;
      }),
    };
  });

  function pointRadii(count: number, highlightIndex: number, normal: number, highlighted: number) {
    return Array.from({ length: count }, (_, i) => (i === highlightIndex ? highlighted : normal));
  }

  function buildDatasets(
    labels: string[],
    income: number[],
    expense: number[],
    cashFlow: number[],
    highlightIndex: number
  ) {
    const count = labels.length;
    return [
      {
        label: 'Revenue',
        data: income,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 2,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: pointRadii(count, highlightIndex, 4, 8),
        pointHoverRadius: 8,
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Expense',
        data: expense,
        borderColor: '#d2475f',
        backgroundColor: 'rgba(244, 63, 94, 0.15)',
        borderWidth: 2,
        pointBackgroundColor: '#d2475f',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: pointRadii(count, highlightIndex, 4, 8),
        pointHoverRadius: 8,
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Cash Flow',
        data: cashFlow,
        borderColor: '#9b6bc9',
        backgroundColor: 'rgba(155, 107, 201, 0.15)',
        borderWidth: 2,
        pointBackgroundColor: '#9b6bc9',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: pointRadii(count, highlightIndex, 5, 9),
        pointHoverRadius: 9,
        fill: true,
        tension: 0.3,
      },
    ];
  }

  function chartOptions(): ChartConfiguration<'line'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 600,
      },
      onClick: (_event, elements) => {
        if (!elements.length || !chart) return;
        const year = chart.data.labels![elements[0].index] as string;
        if (selectedYear === year) return;
        if (onYearSelect) {
          onYearSelect(year);
        } else {
          selectedYear = year;
        }
      },
      onHover: (event, elements) => {
        const target = event.native?.target as HTMLElement | undefined;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 16,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed.y ?? 0;
              return `${ctx.dataset.label}: SGD ${formatCompactSGD(value)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Year',
            font: { size: 12, weight: 'bold' },
          },
          grid: { display: false },
        },
        y: {
          title: {
            display: true,
            text: 'Amount (SGD)',
            font: { size: 12, weight: 'bold' },
          },
          grid: {},
          ticks: {
            callback: (value) => formatCompactSGD(Number(value)),
          },
        },
      },
    };
  }

  // Create chart once when canvas mounts — cleanup only on unmount.
  $effect(() => {
    if (!canvas) return;

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: buildDatasets([], [], [], [], -1),
      },
      options: chartOptions(),
    });

    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  // Sync transaction data without replaying animation.
  $effect(() => {
    if (!chart) return;

    chart.data.labels = data.labels;
    chart.data.datasets[0].data = data.income;
    chart.data.datasets[1].data = data.expense;
    chart.data.datasets[2].data = data.cashFlow;

    if (!hasInitialAnimation && data.labels.length > 0) {
      chart.update();
      hasInitialAnimation = true;
    } else {
      chart.update('none');
    }
  });

  // Update highlight only when selected year changes.
  $effect(() => {
    if (!chart) return;

    const highlightIndex = selectedYear ? data.labels.indexOf(selectedYear) : -1;
    const count = chart.data.labels?.length ?? 0;

    chart.data.datasets[0].pointRadius = pointRadii(count, highlightIndex, 4, 8);
    chart.data.datasets[1].pointRadius = pointRadii(count, highlightIndex, 4, 8);
    chart.data.datasets[2].pointRadius = pointRadii(count, highlightIndex, 5, 9);
    chart.update('none');
  });
</script>

<canvas bind:this={canvas}></canvas>

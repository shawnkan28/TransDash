<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import type { ChartConfiguration } from 'chart.js';
  import { financeStore } from '../lib/store.svelte';
  import { formatCompactSGD } from '../lib/currency';
  import { buildCashFlowForecast, computeMonthlyCashFlow } from '../lib/cashFlowForecast';

  let {
    year = null,
    spreadTravel = true,
    selectedMonth = $bindable<number | null>(null),
    selectedCategory = $bindable<string | null>(null),
    breakdownSource = $bindable<'category' | 'month'>('category'),
  }: {
    year?: string | null;
    spreadTravel?: boolean;
    selectedMonth?: number | null;
    selectedCategory?: string | null;
    breakdownSource?: 'category' | 'month';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart<'line'> | null = null;
  let lastAnimatedYear: string | null | undefined = undefined;
  let lastSpreadTravel: boolean | undefined = undefined;
  let suppressInstantUpdateUntil = 0;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const NULL_SERIES = Array<number | null>(12).fill(null);

  const data = $derived.by(() => {
    if (!year) {
      return {
        labels: MONTHS,
        income: Array(12).fill(0),
        expense: Array(12).fill(0),
      };
    }

    const totals = computeMonthlyCashFlow(financeStore.transactions, year, spreadTravel);
    return {
      labels: MONTHS,
      income: totals.income,
      expense: totals.expense,
    };
  });

  const chartSeries = $derived.by(() => {
    if (!year) {
      return {
        showForecast: false,
        currentMonth: new Date().getMonth(),
        incomeActual: Array(12).fill(0),
        expenseActual: Array(12).fill(0),
        incomeForecast: NULL_SERIES,
        expenseForecast: NULL_SERIES,
      };
    }

    return buildCashFlowForecast(financeStore.transactions, year, spreadTravel);
  });

  function actualPointRadii(
    count: number,
    highlightIndex: number,
    currentMonth: number,
    normal: number,
    highlighted: number
  ) {
    return Array.from({ length: count }, (_, i) => {
      if (i > currentMonth) return 0;
      return breakdownSource === 'month' && i === highlightIndex ? highlighted : normal;
    });
  }

  function tooltipFilter(
    showForecast: boolean,
    currentMonth: number,
    item: { parsed: { y: number | null }; dataIndex: number; dataset: { label?: string } }
  ) {
    if (item.parsed.y === null || Number.isNaN(item.parsed.y)) return false;

    const isProjected = String(item.dataset.label).includes('(projected)');

    if (showForecast) {
      if (item.dataIndex > currentMonth) return isProjected;
      if (item.dataIndex <= currentMonth) return !isProjected;
    }

    return true;
  }

  function forecastPointRadii(
    count: number,
    highlightIndex: number,
    currentMonth: number,
    normal: number,
    highlighted: number
  ) {
    return Array.from({ length: count }, (_, i) => {
      if (i <= currentMonth) return 0;
      return breakdownSource === 'month' && i === highlightIndex ? highlighted : normal;
    });
  }

  function chartOptions(currentMonth: number): ChartConfiguration<'line'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 600,
      },
      onClick: (_event, elements) => {
        if (!elements.length) return;
        selectedCategory = null;
        selectedMonth = elements[0].index;
        breakdownSource = 'month';
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
            filter: (item) => !String(item.text).includes('(projected)'),
          },
        },
        tooltip: {
          filter: (item) => tooltipFilter(false, currentMonth, item),
          callbacks: {
            label: (ctx) => {
              const value = ctx.parsed.y ?? 0;
              const projected = String(ctx.dataset.label).includes('(projected)');
              const suffix = projected ? ' (projected)' : '';
              return `${ctx.dataset.label}: SGD ${formatCompactSGD(value)}${suffix}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Month',
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

  function applyChartData(animate: boolean) {
    if (!chart) return;

    const highlightIndex = selectedMonth ?? -1;
    const count = data.labels.length;
    const { showForecast, currentMonth, incomeActual, expenseActual, incomeForecast, expenseForecast } =
      chartSeries;

    chart.data.labels = data.labels;
    chart.data.datasets[0].data = incomeActual;
    chart.data.datasets[1].data = showForecast ? incomeForecast : [...NULL_SERIES];
    chart.data.datasets[2].data = expenseActual;
    chart.data.datasets[3].data = showForecast ? expenseForecast : [...NULL_SERIES];

    chart.data.datasets[0].pointRadius = actualPointRadii(
      count,
      highlightIndex,
      showForecast ? currentMonth : 11,
      3,
      7
    );
    chart.data.datasets[2].pointRadius = actualPointRadii(
      count,
      highlightIndex,
      showForecast ? currentMonth : 11,
      3,
      7
    );

    if (showForecast) {
      chart.data.datasets[1].pointRadius = forecastPointRadii(
        count,
        highlightIndex,
        currentMonth,
        2,
        5
      );
      chart.data.datasets[3].pointRadius = forecastPointRadii(
        count,
        highlightIndex,
        currentMonth,
        2,
        5
      );
    } else {
      chart.data.datasets[1].pointRadius = NULL_SERIES.map(() => 0);
      chart.data.datasets[3].pointRadius = NULL_SERIES.map(() => 0);
    }

    if (chart.options.plugins?.tooltip) {
      chart.options.plugins.tooltip.filter = (item) =>
        tooltipFilter(showForecast, currentMonth, item);
    }

    if (animate) {
      suppressInstantUpdateUntil = Date.now() + 650;
      chart.update();
    } else if (Date.now() < suppressInstantUpdateUntil) {
      return;
    } else {
      chart.update('none');
    }
  }

  $effect(() => {
    if (!canvas) return;

    const highlightIndex = selectedMonth ?? -1;
    const currentMonth = new Date().getMonth();

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: MONTHS,
        datasets: [
          {
            label: 'Income',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderWidth: 2,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: actualPointRadii(12, highlightIndex, currentMonth, 3, 7),
            pointHoverRadius: 7,
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Income (projected)',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: forecastPointRadii(12, highlightIndex, currentMonth, 2, 5),
            pointHoverRadius: 5,
            fill: false,
            tension: 0.3,
          },
          {
            label: 'Expense',
            data: [],
            borderColor: '#d2475f',
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            borderWidth: 2,
            pointBackgroundColor: '#d2475f',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: actualPointRadii(12, highlightIndex, currentMonth, 3, 7),
            pointHoverRadius: 7,
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Expense (projected)',
            data: [],
            borderColor: '#d2475f',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointBackgroundColor: '#d2475f',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: forecastPointRadii(12, highlightIndex, currentMonth, 2, 5),
            pointHoverRadius: 5,
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: chartOptions(currentMonth),
    });

    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  $effect(() => {
    if (!chart) return;

    const currentYear = year ?? null;
    const yearChanged = lastAnimatedYear !== currentYear;
    const modeChanged = lastSpreadTravel !== spreadTravel;
    lastAnimatedYear = currentYear;
    lastSpreadTravel = spreadTravel;

    selectedMonth;
    breakdownSource;
    chartSeries;

    applyChartData((yearChanged || modeChanged) && data.labels.length > 0);
  });
</script>

<canvas bind:this={canvas}></canvas>

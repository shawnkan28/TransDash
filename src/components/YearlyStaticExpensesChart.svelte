<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import type { ChartConfiguration } from 'chart.js';
  import { financeStore } from '../lib/store.svelte';
  import { transactionValueInSGD } from '../lib/currency';
  import { predictCurrentYearSpendingHabitsRatio } from '../lib/cashFlowForecast';

  let { spreadTravel = true }: { spreadTravel?: boolean } = $props();

  function spendingHabitsRatio(spending: number, salary: number): number {
    if (salary <= 0) return spending > 0 ? 100 : 0;
    return Math.min(100, Math.max(0, (spending / salary) * 100));
  }

  function formatRatio(value: number): string {
    return `${Math.round(value)}%`;
  }

  let canvas: HTMLCanvasElement;
  let chart: Chart<'line'> | null = null;
  let hasInitialAnimation = false;

  const currentYear = `${new Date().getFullYear()}`;

  const data = $derived.by(() => {
    const spendingByYear = new Map<string, number>();
    const salaryByYear = new Map<string, number>();

    financeStore.transactions
      .filter((t) => t.affectCashFlow)
      .forEach((t) => {
        const year = `${t.date.getFullYear()}`;
        const sgdValue = transactionValueInSGD(t);

        if (t.transactionType === 'Expense' && t.categoryGroup !== 'Bills') {
          spendingByYear.set(year, (spendingByYear.get(year) ?? 0) + sgdValue);
        }

        if (t.transactionType === 'Income' && t.category === 'Salary') {
          salaryByYear.set(year, (salaryByYear.get(year) ?? 0) + sgdValue);
        }
      });

    const sortedYears = Array.from(
      new Set([...spendingByYear.keys(), ...salaryByYear.keys()])
    ).sort();

    const spending = sortedYears.map((y) => spendingByYear.get(y) ?? 0);
    const salary = sortedYears.map((y) => salaryByYear.get(y) ?? 0);

    const predictedRatio = predictCurrentYearSpendingHabitsRatio(
      financeStore.transactions,
      spreadTravel
    );

    return {
      labels: sortedYears,
      ratio: spending.map((amount, i) => spendingHabitsRatio(amount, salary[i])),
      predictedRatio,
    };
  });

  function buildDatasets(values: number[], predictedRatio: number | null) {
    const datasets: ChartConfiguration<'line'>['data']['datasets'] = [
      {
        label: 'Spending Habits Ratio',
        data: values,
        borderColor: '#9b6bc9',
        backgroundColor: 'rgba(155, 107, 201, 0.15)',
        borderWidth: 2,
        pointBackgroundColor: '#9b6bc9',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 8,
        fill: true,
        tension: 0.3,
        order: 1,
      },
    ];

    if (predictedRatio !== null) {
      datasets.push({
        label: `${currentYear} (projected)`,
        data: values.map(() => predictedRatio),
        borderColor: '#8b5cf6',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        order: 0,
      });
    }

    return datasets;
  }

  function chartOptions(): ChartConfiguration<'line'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 600,
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
              return `${ctx.dataset.label}: ${formatRatio(value)}`;
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
          min: 0,
          max: 100,
          title: {
            display: true,
            text: '% of Salary',
            font: { size: 12, weight: 'bold' },
          },
          grid: {},
          ticks: {
            stepSize: 25,
            callback: (value) => formatRatio(Number(value)),
          },
        },
      },
    };
  }

  $effect(() => {
    if (!canvas) return;

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: buildDatasets([], null),
      },
      options: chartOptions(),
    });

    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  $effect(() => {
    if (!chart) return;

    spreadTravel;
    financeStore.transactions;

    chart.data.labels = data.labels;
    chart.data.datasets = buildDatasets(data.ratio, data.predictedRatio);

    if (!hasInitialAnimation && data.labels.length > 0) {
      chart.update();
      hasInitialAnimation = true;
    } else {
      chart.update('none');
    }
  });
</script>

<canvas bind:this={canvas}></canvas>

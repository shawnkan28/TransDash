<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import type { ChartDataset } from 'chart.js';
  import { financeStore } from '../lib/store.svelte';
  import { formatCompactSGD } from '../lib/currency';
  import { monthlyBudgetNetDelta } from '../lib/monthlyBudget';

  let {
    budgetId = '',
    year = String(new Date().getFullYear()),
  }: {
    budgetId?: string;
    year?: string;
  } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  const series = $derived.by(() => {
    const yearNum = Number(year);
    const budget = financeStore.monthlyBudgets.find((item) => item.id === budgetId);
    if (!budget || !Number.isFinite(yearNum)) {
      return {
        labels: [] as string[],
        values: [] as number[],
        limit: 0,
      };
    }

    const categoryBudgetMap = new Map<string, string>();
    financeStore.categories.forEach((category) => {
      if (category.monthlyBudgetId) {
        categoryBudgetMap.set(category.label, category.monthlyBudgetId);
      }
    });

    const labels: string[] = [];
    const values: number[] = [];

    for (let month = 0; month < 12; month++) {
      let net = 0;

      financeStore.transactions.forEach((transaction) => {
        net += monthlyBudgetNetDelta(transaction, categoryBudgetMap, {
          budgetId,
          year: yearNum,
          month,
        });
      });

      labels.push(
        new Date(yearNum, month, 1).toLocaleDateString('en-US', { month: 'short' })
      );
      values.push(Math.round(net * 100) / 100);
    }

    return { labels, values, limit: budget.amount };
  });

  function pointColors(values: number[], limit: number): string[] {
    return values.map((value) => (limit > 0 && value > limit ? '#d2475f' : '#9b6bc9'));
  }

  const monthlyLimitLabelPlugin = {
    id: 'monthlyLimitLabel',
    afterDatasetsDraw(chart: Chart) {
      const limit = series.limit;
      if (!series.labels.length || limit <= 0) return;

      const yScale = chart.scales.y;
      const { ctx, chartArea } = chart;
      if (!yScale) return;

      const y = yScale.getPixelForValue(limit);
      const text = `Limit $${formatCompactSGD(limit)}`;

      ctx.save();
      ctx.font = '700 11px system-ui, -apple-system, sans-serif';
      const paddingX = 8;
      const textWidth = ctx.measureText(text).width;
      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 20;
      const boxX = chartArea.right - boxWidth - 4;
      const boxY = Math.min(
        Math.max(y - boxHeight / 2, chartArea.top + 2),
        chartArea.bottom - boxHeight - 2
      );

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, boxX + boxWidth / 2, boxY + boxHeight / 2 + 0.5);
      ctx.restore();
    },
  };

  const zeroLinePlugin = {
    id: 'zeroLine',
    afterDraw(chart: Chart) {
      const yScale = chart.scales.y;
      const { ctx, chartArea } = chart;
      if (!yScale) return;

      const zeroY = yScale.getPixelForValue(0);
      if (zeroY < chartArea.top || zeroY > chartArea.bottom) return;

      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, zeroY);
      ctx.lineTo(chartArea.right, zeroY);
      ctx.stroke();
      ctx.restore();
    },
  };

  $effect(() => {
    if (!canvas) return;

    chart = new Chart(canvas, {
      type: 'line',
      plugins: [zeroLinePlugin, monthlyLimitLabelPlugin],
      data: {
        labels: [],
        datasets: [
          {
            label: 'Monthly Spending',
            data: [],
            borderColor: '#9b6bc9',
            backgroundColor: 'rgba(155, 107, 201, 0.12)',
            pointBackgroundColor: '#9b6bc9',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            order: 2,
          },
          {
            label: 'Monthly Limit',
            data: [],
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            order: 1,
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
            ticks: {
              callback: (value) => `$${formatCompactSGD(Number(value))}`,
            },
            grid: {},
          },
          x: {
            grid: { display: false },
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
    if (!chart) return;

    const spendingDataset = chart.data.datasets[0] as ChartDataset<'line'>;
    const limitDataset = chart.data.datasets[1] as ChartDataset<'line'>;
    chart.data.labels = series.labels;
    spendingDataset.data = series.values;
    spendingDataset.pointBackgroundColor = pointColors(series.values, series.limit);
    limitDataset.data = series.labels.length
      ? series.labels.map(() => series.limit)
      : [];
    chart.update();
  });
</script>

<div class="relative h-72">
  <canvas bind:this={canvas} class="h-full w-full"></canvas>
  {#if !budgetId}
    <div
      class="absolute inset-0 flex items-center justify-center bg-surface text-sm text-gray-500"
    >
      Select a monthly budget to view spending trends.
    </div>
  {/if}
</div>

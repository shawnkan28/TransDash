<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import { financeStore } from '../lib/store.svelte';
  import { transactionValueInSGD, formatCompactSGD } from '../lib/currency';
  import { matchesSearchPattern } from '../lib/search';

  let {
    category,
    year = null,
    noteQuery = '',
    excludeGroups = [],
  }: {
    category: string;
    year?: string | null;
    /** Narrows the category to entries whose note matches, e.g. "Taxi". */
    noteQuery?: string;
    excludeGroups?: string[];
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  /**
   * Days a month contributes to its average: the whole month, except the
   * current one, which only counts the days elapsed so far.
   */
  function daysCounted(year: number, monthIndex: number): number {
    const now = new Date();
    if (year === now.getFullYear() && monthIndex === now.getMonth()) return now.getDate();
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  // The category's cash-flow spend (SGD) per calendar month, as a per-day average.
  const monthly = $derived.by(() => {
    const totals = new Map<string, number>();

    financeStore.transactions.forEach((transaction) => {
      if (transaction.category !== category) return;
      if (transaction.transactionType !== 'Expense' || !transaction.affectCashFlow) return;
      if (excludeGroups.includes(transaction.categoryGroup)) return;
      if (Number.isNaN(transaction.date.getTime())) return;
      if (year !== null && `${transaction.date.getFullYear()}` !== year) return;
      if (!matchesSearchPattern(transaction.note ?? '', noteQuery)) return;

      const key = `${transaction.date.getFullYear()}-${String(
        transaction.date.getMonth() + 1
      ).padStart(2, '0')}`;
      totals.set(key, (totals.get(key) ?? 0) + transactionValueInSGD(transaction));
    });

    const entries = Array.from(totals.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));

    let totalSpend = 0;
    let totalDays = 0;
    const values = entries.map(([key, total]) => {
      const [y, m] = key.split('-').map(Number);
      const days = daysCounted(y, m - 1);
      totalSpend += total;
      totalDays += days;
      return total / days;
    });

    return {
      labels: entries.map(([key]) => {
        const [y, m] = key.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        });
      }),
      values,
      totals: entries.map(([, total]) => total),
      // Weighted by days, so short and partial months don't skew it.
      average: totalDays > 0 ? totalSpend / totalDays : 0,
    };
  });

  // Draws the average value as a pill anchored to the right end of the line.
  const averageLabelPlugin = {
    id: 'averageLabel',
    afterDatasetsDraw(chart: Chart) {
      const average = monthly.average;
      if (!monthly.labels.length || average <= 0) return;

      const yScale = chart.scales.y;
      const { ctx, chartArea } = chart;
      if (!yScale) return;

      const y = yScale.getPixelForValue(average);
      const text = `Avg $${formatCompactSGD(average)}/day`;

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

  $effect(() => {
    if (!canvas) return;

    chart = new Chart(canvas, {
      type: 'bar',
      plugins: [averageLabelPlugin],
      data: {
        labels: [],
        datasets: [
          {
            label: 'Avg per Day',
            data: [],
            backgroundColor: '#9b6bc9',
            hoverBackgroundColor: '#6d4399',
            borderRadius: 6,
            maxBarThickness: 48,
            order: 2,
          },
          {
            type: 'line',
            label: 'Overall Average',
            data: [],
            xAxisID: 'xLine',
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHitRadius: 0,
            fill: false,
            order: 1,
          },
          {
            type: 'line',
            label: 'Monthly Spend',
            data: [],
            yAxisID: 'yTotal',
            borderColor: '#14b8a6',
            backgroundColor: '#14b8a6',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: false,
            order: 0,
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
            title: { display: true, text: 'Per day', font: { size: 11 } },
          },
          // Monthly totals run ~30x the daily figure, so they get their own axis.
          yTotal: {
            position: 'right',
            beginAtZero: true,
            ticks: {
              callback: (value) => `$${formatCompactSGD(Number(value))}`,
            },
            grid: { display: false },
            title: { display: true, text: 'Per month', font: { size: 11 } },
          },
          x: {
            grid: { display: false },
          },
          xLine: {
            type: 'linear',
            display: false,
            min: 0,
            max: 1,
            offset: false,
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
    chart.data.labels = monthly.labels;
    chart.data.datasets[0].data = monthly.values;
    chart.data.datasets[1].data = monthly.labels.length
      ? [
          { x: 0, y: monthly.average },
          { x: 1, y: monthly.average },
        ]
      : [];
    chart.data.datasets[2].data = monthly.totals;
    chart.update();
  });
</script>

<div class="relative h-72">
  <canvas bind:this={canvas}></canvas>
  {#if monthly.labels.length === 0}
    <p class="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
      {#if !category}
        Pick a category to see its daily average.
      {:else if noteQuery.trim()}
        No entries matching "{noteQuery.trim()}" for the selected period.
      {:else}
        No spending in this category for the selected period.
      {/if}
    </p>
  {/if}
</div>

<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import { financeStore } from '../lib/store.svelte';
  import { transactionValueInSGD, formatCompactSGD } from '../lib/currency';

  let {
    year = null,
    selectedKey = null,
    onSelectMonth = undefined,
    excludeGroups = [],
  }: {
    year?: string | null;
    selectedKey?: string | null;
    onSelectMonth?: (key: string | null) => void;
    excludeGroups?: string[];
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  // Total cash-flow expenses (SGD) per calendar month, sorted chronologically.
  const monthly = $derived.by(() => {
    const totals = new Map<string, number>();

    financeStore.transactions.forEach((transaction) => {
      if (transaction.transactionType !== 'Expense' || !transaction.affectCashFlow) return;
      if (excludeGroups.includes(transaction.categoryGroup)) return;
      if (Number.isNaN(transaction.date.getTime())) return;
      if (year !== null && `${transaction.date.getFullYear()}` !== year) return;

      const key = `${transaction.date.getFullYear()}-${String(
        transaction.date.getMonth() + 1
      ).padStart(2, '0')}`;
      totals.set(key, (totals.get(key) ?? 0) + transactionValueInSGD(transaction));
    });

    const entries = Array.from(totals.entries()).sort((a, b) =>
      a[0] < b[0] ? -1 : 1
    );

    const values = entries.map(([, value]) => value);
    const average = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

    return {
      keys: entries.map(([key]) => key),
      labels: entries.map(([key]) => {
        const [year, month] = key.split('-').map(Number);
        return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        });
      }),
      values,
      average,
    };
  });

  function barColors() {
    return monthly.keys.map((key) => (selectedKey === key ? '#6d4399' : '#9b6bc9'));
  }

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
      const text = `Avg $${formatCompactSGD(average)}`;

      ctx.save();
      ctx.font = '700 11px system-ui, -apple-system, sans-serif';
      const paddingX = 8;
      const paddingY = 4;
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
            label: 'Monthly Expense',
            data: [],
            backgroundColor: '#9b6bc9',
            hoverBackgroundColor: '#6d4399',
            borderRadius: 6,
            maxBarThickness: 48,
            order: 2,
          },
          {
            type: 'line',
            label: 'Average',
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
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 8 },
        onClick: (_event, elements) => {
          const barElement = elements.find((element) => element.datasetIndex === 0) ?? elements[0];
          if (!barElement) return;
          const key = monthly.keys[barElement.index];
          if (!key) return;
          onSelectMonth?.(selectedKey === key ? null : key);
        },
        onHover: (event, elements) => {
          const target = event.native?.target as HTMLElement | undefined;
          if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
        },
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
    chart.data.datasets[0].backgroundColor = barColors();
    chart.data.datasets[1].data = monthly.labels.length
      ? [
          { x: 0, y: monthly.average },
          { x: 1, y: monthly.average },
        ]
      : [];
    chart.update();
  });
</script>

<div class="h-72">
  <canvas bind:this={canvas}></canvas>
</div>

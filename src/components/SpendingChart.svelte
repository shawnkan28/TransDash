<script lang="ts">
  import Chart from 'chart.js/auto';
  import '../lib/chartTheme';
  import type { ChartConfiguration, Plugin } from 'chart.js';
  import { ArcElement } from 'chart.js';
  import { financeStore } from '../lib/store.svelte';
  import { formatCompactSGD } from '../lib/currency';
  import { getCategoryBreakdown } from '../lib/categoryBreakdown';

  let {
    year = null,
    selectedCategory = $bindable<string | null>(null),
    breakdownSource = $bindable<'category' | 'month'>('category'),
  }: {
    year?: string | null;
    selectedCategory?: string | null;
    breakdownSource?: 'category' | 'month';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart<'doughnut'> | null = null;
  let lastAnimatedYear: string | null | undefined = undefined;
  let lastBreakdownSource: 'category' | 'month' | undefined = undefined;

  const CHART_COLORS = ['#9b6bc9', '#2f9e75', '#e0a020', '#4a7fd4', '#e85a7a'];
  const OTHERS_COLOR = '#b3aec0';

  const slices = $derived(getCategoryBreakdown(financeStore.transactions, year ?? null));

  const data = $derived({
    labels: slices.map((s) => s.label),
    values: slices.map((s) => s.value),
  });

  function chartColors(labels: string[], selected: string | null) {
    return labels.map((label, i) => {
      if (label === 'Others') return OTHERS_COLOR;
      if (selected && label !== selected) return CHART_COLORS[i % CHART_COLORS.length] + '55';
      return CHART_COLORS[i % CHART_COLORS.length];
    });
  }

  function chartOffsets(labels: string[], selected: string | null) {
    return labels.map((label) => (selected && label === selected ? 12 : 0));
  }

  function formatDollar(value: number) {
    return `$${formatCompactSGD(value)}`;
  }

  function solidColor(color: string) {
    return color.length === 9 ? color.slice(0, 7) : color;
  }

  const categoryLabelsPlugin: Plugin<'doughnut'> = {
    id: 'categoryLabels',
    afterDraw(chart) {
      const { ctx } = chart;
      const dataset = chart.data.datasets[0]?.data as number[] | undefined;
      const labels = chart.data.labels as string[] | undefined;
      const colors = chart.data.datasets[0]?.backgroundColor as string[] | undefined;
      if (!dataset?.length || !labels?.length || !colors?.length) return;

      const total = dataset.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return;

      const meta = chart.getDatasetMeta(0);
      const labelOffset = 10;

      ctx.save();
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';

      meta.data.forEach((element, index) => {
        if (!(element instanceof ArcElement)) return;

        const angle = (element.startAngle + element.endAngle) / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = element.x + cos * (element.outerRadius + labelOffset);
        const y = element.y + sin * (element.outerRadius + labelOffset);

        if (Math.abs(cos) < 0.25) {
          ctx.textAlign = 'center';
        } else {
          ctx.textAlign = cos > 0 ? 'left' : 'right';
        }

        ctx.fillStyle = solidColor(colors[index]);
        ctx.fillText(labels[index], x, y);
      });

      ctx.restore();
    },
  };

  function chartOptions(): ChartConfiguration<'doughnut'>['options'] {
    return {
      cutout: '70%',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 24,
      },
      onClick: (_event, elements) => {
        if (!elements.length || !chart) return;
        const label = chart.data.labels![elements[0].index] as string;
        selectedCategory = label;
        breakdownSource = 'category';
      },
      onHover: (event, elements) => {
        const target = event.native?.target as HTMLElement | undefined;
        if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (ctx: { label: string; raw: unknown }) =>
              `${ctx.label}: ${formatDollar(Number(ctx.raw))}`,
          },
        },
      },
    };
  }

  // Create chart once when canvas mounts — cleanup only on unmount.
  $effect(() => {
    if (!canvas) return;

    chart = new Chart(canvas, {
      type: 'doughnut',
      plugins: [categoryLabelsPlugin],
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            offset: [],
            borderWidth: 0,
            hoverOffset: 8,
          },
        ],
      },
      options: chartOptions(),
    });

    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  // Animate on year change or when monthly cash flow takes over the breakdown table.
  $effect(() => {
    if (!chart) return;

    const currentYear = year ?? null;
    const currentSource = breakdownSource;

    chart.data.labels = data.labels;
    chart.data.datasets[0].data = data.values;
    chart.data.datasets[0].backgroundColor = chartColors(data.labels, selectedCategory);
    chart.data.datasets[0].offset = chartOffsets(data.labels, selectedCategory);

    if (data.labels.length === 0) return;

    const yearChanged = lastAnimatedYear !== currentYear;
    const monthBreakdownSelected =
      currentSource === 'month' && lastBreakdownSource !== 'month';
    lastAnimatedYear = currentYear;
    lastBreakdownSource = currentSource;

    if (yearChanged || monthBreakdownSelected) {
      chart.update();
    } else {
      chart.update('none');
    }
  });
</script>

<canvas bind:this={canvas}></canvas>

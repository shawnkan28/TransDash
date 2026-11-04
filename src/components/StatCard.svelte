<script lang="ts">
  import { TrendingUp, TrendingDown } from 'lucide-svelte';
  import { wholeCurrencyFormatter as formatter } from '../lib/formatters';

  let { title, value, type = 'neutral', icon: Icon, trend = 0 } = $props<{
    title: string;
    value: number;
    type?: 'income' | 'expense' | 'neutral';
    icon: any;
    trend?: number;
  }>();

  const formattedValue = $derived(formatter.format(value));
  const isPositive = $derived(trend > 0);
  const trendColor = $derived(isPositive ? 'text-[#10b981]' : 'text-[#f43f5e]');
</script>

<div class="bg-surface rounded-[20px] p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-gray-100">
  <div class="flex items-center gap-3 mb-4 text-gray-600">
    <div class="p-1.5 border border-gray-200 rounded-[10px]">
      <Icon size={18} strokeWidth={2} />
    </div>
    <h3 class="text-[13px] font-bold">{title}</h3>
  </div>
  
  <p class="text-[32px] font-extrabold text-gray-900 tracking-tight mb-4">{formattedValue}</p>
  
  <div class="flex items-center gap-1.5 text-xs font-semibold">
    <span class="flex items-center {trendColor}">
      {#if isPositive}
        ↑ {trend}%
      {:else}
        ↓ {Math.abs(trend)}%
      {/if}
    </span>
    <span class="text-gray-400 font-medium">compared to last month</span>
  </div>
</div>

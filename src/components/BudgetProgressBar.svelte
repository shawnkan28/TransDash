<script lang="ts">
  import type { BudgetBarStatus } from '../lib/monthlyBudget';

  /**
   * The one budget bar. Previously copy-pasted four times — three of them in
   * Budget.svelte alone — which is how the savings colours ended up applied to
   * only one of them.
   */
  let {
    percent,
    status = 'healthy',
    showLabel = false,
  }: {
    percent: number;
    status?: BudgetBarStatus;
    /** Desktop tables put the figure beside the bar; the mobile cards don't. */
    showLabel?: boolean;
  } = $props();

  const fillClass = $derived(
    status === 'critical'
      ? 'bg-rose-500'
      : status === 'warning'
        ? 'bg-amber-500'
        : 'bg-accent-600'
  );
</script>

<div class="flex items-center gap-3">
  <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
    <div class="h-full rounded-full transition-all {fillClass}" style={`width: ${percent}%`}></div>
  </div>
  {#if showLabel}
    <span class="w-10 text-right text-xs font-semibold text-gray-500">{percent}%</span>
  {/if}
</div>

<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { CalendarClock, Check } from 'lucide-svelte';
  import { scheduledStatuses } from '../lib/scheduledTransactions';
  import { formatDayMonthYear } from '../lib/dateFormat';
  import { formatCurrency } from '../lib/formatters';

  // Ids currently being written, so their row can show progress and no row
  // can be double-tapped into two identical transactions.
  let posting = $state<string[]>([]);
  let postingAll = $state(false);

  const due = $derived(
    scheduledStatuses(financeStore.scheduledTransactions, financeStore.transactions).filter(
      (status) => status.due
    )
  );

  async function post(id: string) {
    const status = due.find((item) => item.scheduled.id === id);
    if (!status || posting.includes(id)) return;

    posting = [...posting, id];
    try {
      await financeStore.postScheduledTransaction(status.scheduled, status.dueDate);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to post scheduled transaction.');
    } finally {
      posting = posting.filter((item) => item !== id);
    }
  }

  async function postAll() {
    if (postingAll) return;
    postingAll = true;
    // One at a time, so a failure part-way leaves a clear boundary between
    // what posted and what did not.
    for (const status of [...due]) {
      await post(status.scheduled.id);
    }
    postingAll = false;
  }
</script>

{#if due.length > 0}
  <div class="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
    <div class="flex items-center gap-2">
      <CalendarClock size={18} class="text-amber-600" />
      <p class="text-sm font-semibold text-amber-900">
        Due this month ({due.length})
      </p>
    </div>

    <ul class="mt-3 space-y-2">
      {#each due as status (status.scheduled.id)}
        <li class="flex items-center gap-3 rounded-xl bg-surface p-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-gray-900">{status.scheduled.label}</p>
            <p class="truncate text-xs text-gray-500">
              {formatDayMonthYear(status.dueDate)} · {status.scheduled.category}
            </p>
          </div>
          <p class="text-sm font-semibold text-gray-900">
            {formatCurrency(status.scheduled.value, status.scheduled.currencyCode)}
          </p>
          <button
            type="button"
            onclick={() => post(status.scheduled.id)}
            disabled={posting.includes(status.scheduled.id)}
            class="shrink-0 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-bold text-white transition-colors active:bg-accent-600 disabled:opacity-50"
          >
            {posting.includes(status.scheduled.id) ? 'Posting…' : 'Post'}
          </button>
        </li>
      {/each}
    </ul>

    {#if due.length > 1}
      <button
        type="button"
        onclick={postAll}
        disabled={postingAll}
        class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-surface py-2.5 text-sm font-semibold text-amber-800 transition-colors active:bg-amber-50 disabled:opacity-50"
      >
        <Check size={16} />
        {postingAll ? 'Posting…' : `Post all (${due.length})`}
      </button>
    {/if}
  </div>
{/if}

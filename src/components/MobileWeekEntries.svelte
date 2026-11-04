<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { ListChecks } from 'lucide-svelte';
  import MobileEntryListSheet from './MobileEntryListSheet.svelte';

  let open = $state(false);

  const weekAgo = $derived.by(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d;
  });

  const entries = $derived(
    financeStore.transactions.filter((transaction) => transaction.date >= weekAgo)
  );
</script>

<button
  type="button"
  onclick={() => (open = true)}
  class="flex w-full items-center justify-center gap-2 rounded-2xl border border-accent-200 bg-surface py-3 text-sm font-semibold text-accent-700 shadow-sm transition-colors active:bg-accent-50"
>
  <ListChecks size={18} />
  This Week's Entries
</button>

<MobileEntryListSheet
  {open}
  title="This Week's Entries"
  transactions={entries}
  emptyMessage="No entries in the past week."
  onClose={() => (open = false)}
/>

<script lang="ts">
  import TransactionTable from './TransactionTable.svelte';
  import { Sparkles, Download } from 'lucide-svelte';
</script>

<div class="space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <h1 class="text-[28px] font-bold text-gray-900 tracking-tight">Transactions</h1>
    <div class="flex items-center gap-3">
      <button disabled class="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-[10px] font-bold text-sm shadow-sm shadow-accent-200 opacity-50 cursor-not-allowed">
        <Sparkles size={16} fill="currentColor" />
        Ask TransDash AI
      </button>
      <button disabled class="flex items-center gap-2 px-4 py-2 bg-surface border border-gray-200 text-gray-700 rounded-[10px] font-bold text-sm shadow-sm opacity-50 cursor-not-allowed">
        <Download size={16} />
        Export Report
      </button>
    </div>
  </div>

  <TransactionTable useSgdAmounts editable />
</div>

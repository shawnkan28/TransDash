<script lang="ts">
  import { UploadCloud } from 'lucide-svelte';
  import { parseTransactions } from '../lib/parser';
  import { financeStore } from '../lib/store.svelte';

  let loading = $state(false);
  let errorMsg = $state('');

  async function handleTransactionUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      loading = true;
      try {
        await parseTransactions(file);
        await financeStore.loadData();
      } catch (e) {
        errorMsg = 'Error parsing transactions.';
      }
      loading = false;
    }
  }
</script>

<div class="glass-panel p-8 rounded-2xl shadow-lg max-w-2xl mx-auto w-full border border-gray-200">
  <div class="flex items-center justify-center mb-6 text-brand-600">
    <UploadCloud size={48} />
  </div>
  <h2 class="text-2xl font-bold text-center mb-2">Import Transactions</h2>
  <p class="text-gray-500 text-center mb-8">Upload your CSV file to get started with your transaction analysis.</p>

  {#if errorMsg}
    <div class="bg-red-100 text-red-700 p-4 rounded-lg mb-6 text-sm font-medium">
      {errorMsg}
    </div>
  {/if}

  <div class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-brand-500 transition-colors bg-surface/50">
    <label class="block cursor-pointer">
      <span class="block text-sm font-semibold text-gray-700 mb-2">Upload Transactions CSV</span>
      <span class="text-xs text-gray-500 mb-4 block">CSV file with columns: Transaction ID, Note, Date, Value, Currency Code, Category, etc.</span>
      <input type="file" accept=".csv" onchange={handleTransactionUpload} disabled={loading} class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 mx-auto max-w-xs" />
    </label>
  </div>
</div>

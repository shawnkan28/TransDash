<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { Plus, Trash2, Save } from 'lucide-svelte';
  import type { ScheduledTransaction } from '../../lib/types';
  import { generateScheduledTransactionId } from '../../lib/scheduledTransactions';

// Cross-tab options come from the saved store rather than another tab's
  // in-progress edits, which is also why each tab can now stand alone.
  const categoryLabels = $derived(financeStore.categories.map((category) => category.label));

  const activeAccountNames = $derived(
    financeStore.accounts.filter((account) => !account.disabled).map((account) => account.name)
  );

  let scheduledTransactions = $state<ScheduledTransaction[]>(
    JSON.parse(JSON.stringify(financeStore.scheduledTransactions))
  );

  let isSavingScheduledTransactions = $state(false);

  function addScheduledTransaction() {
    const nextOrder = scheduledTransactions.reduce(
      (max, scheduled) => Math.max(max, scheduled.order ?? 0),
      -1
    ) + 1;
    scheduledTransactions.push({
      id: generateScheduledTransactionId(),
      label: 'New Scheduled Transaction',
      note: '',
      dayOfMonth: 1,
      value: 0,
      currencyCode: 'SGD',
      exchangeRate: 1,
      category: categoryLabels[0] ?? '',
      accountName: activeAccountNames[0] ?? '',
      disabled: false,
      order: nextOrder,
    });
  }

  function removeScheduledTransaction(index: number) {
    scheduledTransactions.splice(index, 1);
  }

  function setScheduledCurrency(scheduled: ScheduledTransaction, code: string) {
    scheduled.currencyCode = code;
    // Matches the Add Transaction sheet: JPY is entered at a ~100:1 rate.
    scheduled.exchangeRate = code === 'JPY' ? 100 : 1;
  }

  async function saveScheduledTransactions() {
    const trimmed = scheduledTransactions
      .map((scheduled, i) => ({
        id: scheduled.id.trim(),
        label: scheduled.label.trim(),
        note: scheduled.note.trim(),
        dayOfMonth: Math.min(Math.max(Math.round(Number(scheduled.dayOfMonth)) || 1, 1), 31),
        value: Number.isFinite(Number(scheduled.value)) ? Number(scheduled.value) : 0,
        currencyCode: (scheduled.currencyCode || 'SGD').trim(),
        exchangeRate:
          Number.isFinite(Number(scheduled.exchangeRate)) && Number(scheduled.exchangeRate) > 0
            ? Number(scheduled.exchangeRate)
            : 1,
        category: scheduled.category.trim(),
        accountName: scheduled.accountName.trim(),
        disabled: scheduled.disabled === true,
        order: Number.isFinite(Number(scheduled.order)) ? Number(scheduled.order) : i,
      }))
      .filter((scheduled) => scheduled.label);

    const labels = trimmed.map((scheduled) => scheduled.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      alert('Each scheduled transaction must have a unique name.');
      return;
    }

    for (const scheduled of trimmed) {
      if (!scheduled.note) {
        alert(`Enter a note for "${scheduled.label}" — it is how the app recognises the month as already posted.`);
        return;
      }
      if (!scheduled.category) {
        alert(`Choose a category for "${scheduled.label}".`);
        return;
      }
      if (!scheduled.accountName) {
        alert(`Choose an account for "${scheduled.label}".`);
        return;
      }
      if (scheduled.value <= 0) {
        alert(`Enter an amount greater than zero for "${scheduled.label}".`);
        return;
      }
    }

    // The note+category pair is the already-posted key, so two schedules
    // sharing one would permanently mask each other in the due list.
    const keys = trimmed.map(
      (scheduled) => `${scheduled.note.toLowerCase()}||${scheduled.category.toLowerCase()}`
    );
    if (new Set(keys).size !== keys.length) {
      alert('Two scheduled transactions share the same note and category. Give them different notes so each can be tracked separately.');
      return;
    }

    const previousIds = financeStore.scheduledTransactions.map((scheduled) => scheduled.id);
    const nextIds = new Set(trimmed.map((scheduled) => scheduled.id));
    const removedIds = previousIds.filter((id) => !nextIds.has(id));

    isSavingScheduledTransactions = true;
    try {
      await db.scheduledTransactions.bulkPut(trimmed);
      if (removedIds.length > 0) {
        await db.scheduledTransactions.bulkDelete(removedIds);
      }

      await financeStore.persistAppSettings();
      await financeStore.loadData();
      scheduledTransactions = JSON.parse(
        JSON.stringify(financeStore.scheduledTransactions)
      );

      alert('Scheduled transactions saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save scheduled transactions.');
    }
    isSavingScheduledTransactions = false;
  }
</script>

  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-surface">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Scheduled Transactions</h2>
        <p class="text-sm text-gray-500 mt-1">
          Recurring monthly entries. Once the day of the month arrives, each one is offered
          on the mobile dashboard for you to confirm — nothing is ever posted automatically.
        </p>
      </div>
      <div class="flex gap-3">
        <button onclick={addScheduledTransaction} class="flex items-center gap-2 px-4 py-2 bg-surface border border-accent-200 text-gray-700 rounded-xl hover:bg-accent-50 transition-colors shadow-sm font-medium text-sm">
          <Plus size={16} />
          Add Scheduled
        </button>
        <button onclick={saveScheduledTransactions} disabled={isSavingScheduledTransactions} class="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-xl hover:bg-accent-500 transition-colors shadow-sm shadow-accent-200 font-medium text-sm disabled:opacity-50">
          <Save size={16} />
          {isSavingScheduledTransactions ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse min-w-[1000px]">
        <thead>
          <tr class="bg-accent-50/50 text-gray-500 text-sm">
            <th class="px-4 py-4 font-semibold">Order</th>
            <th class="px-4 py-4 font-semibold">Name</th>
            <th class="px-4 py-4 font-semibold">Day</th>
            <th class="px-4 py-4 font-semibold">Note</th>
            <th class="px-4 py-4 font-semibold">Amount</th>
            <th class="px-4 py-4 font-semibold">Category</th>
            <th class="px-4 py-4 font-semibold">Account</th>
            <th class="px-4 py-4 font-semibold">Status</th>
            <th class="px-4 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-accent-50">
          {#each scheduledTransactions as scheduled, i (scheduled.id)}
            <tr class="hover:bg-accent-50/30 transition-colors align-top">
              <td class="px-4 py-3 align-top">
                <input
                  type="number"
                  step="1"
                  value={scheduled.order ?? i}
                  oninput={(event) => (scheduled.order = Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-16 rounded-lg border border-accent-200 px-2 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-4 py-3 align-top">
                <input
                  type="text"
                  bind:value={scheduled.label}
                  class="w-40 px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-4 py-3 align-top">
                <input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  value={scheduled.dayOfMonth}
                  oninput={(event) => (scheduled.dayOfMonth = Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-16 rounded-lg border border-accent-200 px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-4 py-3 align-top">
                <input
                  type="text"
                  bind:value={scheduled.note}
                  placeholder="e.g. Rent"
                  class="w-40 px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                />
              </td>
              <td class="px-4 py-3 align-top">
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={scheduled.value}
                    oninput={(event) => (scheduled.value = Number((event.currentTarget as HTMLInputElement).value))}
                    class="w-24 rounded-lg border border-accent-200 px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                  />
                  <div class="flex rounded-lg border border-accent-200 overflow-hidden text-xs font-semibold">
                    {#each ['SGD', 'JPY'] as code (code)}
                      <button
                        type="button"
                        onclick={() => setScheduledCurrency(scheduled, code)}
                        class="px-2 py-1.5 transition-colors {scheduled.currencyCode === code ? 'bg-accent-600 text-white' : 'bg-surface text-gray-500 hover:bg-accent-50'}"
                      >
                        {code}
                      </button>
                    {/each}
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 align-top">
                <select
                  bind:value={scheduled.category}
                  class="w-44 px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                >
                  {#if scheduled.category && !categoryLabels.includes(scheduled.category)}
                    <option value={scheduled.category}>{scheduled.category}</option>
                  {/if}
                  {#each categoryLabels as label (label)}
                    <option value={label}>{label}</option>
                  {/each}
                </select>
              </td>
              <td class="px-4 py-3 align-top">
                <select
                  bind:value={scheduled.accountName}
                  class="w-40 px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
                >
                  {#if scheduled.accountName && !activeAccountNames.includes(scheduled.accountName)}
                    <option value={scheduled.accountName}>{scheduled.accountName} (disabled)</option>
                  {/if}
                  {#each activeAccountNames as name (name)}
                    <option value={name}>{name}</option>
                  {/each}
                </select>
              </td>
              <td class="px-4 py-3 align-top">
                <button
                  type="button"
                  onclick={() => (scheduled.disabled = !scheduled.disabled)}
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors {scheduled.disabled ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}"
                >
                  {scheduled.disabled ? 'Paused' : 'Active'}
                </button>
              </td>
              <td class="px-4 py-3 align-top text-right">
                <button onclick={() => removeScheduledTransaction(i)} class="inline-flex text-gray-400 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          {/each}
          {#if scheduledTransactions.length === 0}
            <tr>
              <td colspan="9" class="px-6 py-12 text-center text-gray-500">
                No scheduled transactions configured. Add one to get started.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div class="px-6 py-4 border-t border-accent-50 bg-accent-50/30 text-xs text-gray-500">
      A month counts as posted once a transaction with the same <span class="font-semibold">note</span> and
      <span class="font-semibold">category</span> exists in it — so paying a bill by hand also clears it from the due list.
    </div>
  </div>

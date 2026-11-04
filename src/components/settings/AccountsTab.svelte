<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { Plus, Trash2, Save } from 'lucide-svelte';
  import type { Account } from '../../lib/types';
  import { ACCOUNT_TYPES } from '../../lib/accountTypes';
  import { syncTransactionAccountTypes } from '../../lib/accounts';

let accounts = $state<Account[]>(JSON.parse(JSON.stringify(financeStore.accounts)));

  let isSavingAccounts = $state(false);

  function addAccount() {
    accounts.push({
      name: 'New Account',
      accountType: ACCOUNT_TYPES[0],
      disabled: false,
    });
  }

  function removeAccount(index: number) {
    accounts.splice(index, 1);
  }

  async function saveAccounts() {
    const trimmedAccounts = accounts
      .map((account) => ({
        name: account.name.trim(),
        accountType: account.accountType.trim(),
        disabled: !!account.disabled,
      }))
      .filter((account) => account.name);

    const names = trimmedAccounts.map((account) => account.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      alert('Each account must have a unique name.');
      return;
    }

    isSavingAccounts = true;
    try {
      await db.accounts.clear();
      await db.accounts.bulkPut(trimmedAccounts);
      await syncTransactionAccountTypes(trimmedAccounts);
      await financeStore.persistAppSettings();
      await financeStore.loadData();
      accounts = JSON.parse(JSON.stringify(financeStore.accounts));
      alert('Accounts saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save accounts.');
    }
    isSavingAccounts = false;
  }
</script>

  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-surface">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Account Configuration</h2>
        <p class="text-sm text-gray-500 mt-1">Manage account names and types used in your transactions.</p>
      </div>
      <div class="flex gap-3">
        <button onclick={addAccount} class="flex items-center gap-2 px-4 py-2 bg-surface border border-accent-200 text-gray-700 rounded-xl hover:bg-accent-50 transition-colors shadow-sm font-medium text-sm">
          <Plus size={16} />
          Add Account
        </button>
        <button onclick={saveAccounts} disabled={isSavingAccounts} class="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-xl hover:bg-accent-500 transition-colors shadow-sm shadow-accent-200 font-medium text-sm disabled:opacity-50">
          <Save size={16} />
          {isSavingAccounts ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse min-w-[480px]">
        <thead>
          <tr class="bg-accent-50/50 text-gray-500 text-sm">
            <th class="px-6 py-4 font-semibold">Account Name</th>
            <th class="px-6 py-4 font-semibold">Account Type</th>
            <th class="px-6 py-4 font-semibold">Status</th>
            <th class="px-6 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-accent-50">
          {#each accounts as account, i}
            <tr class="hover:bg-accent-50/30 transition-colors {account.disabled ? 'opacity-60' : ''}">
              <td class="px-6 py-3">
                <input type="text" bind:value={account.name} class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface" />
              </td>
              <td class="px-6 py-3">
                <select bind:value={account.accountType} class="w-full px-3 py-1.5 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface">
                  {#if account.accountType && !ACCOUNT_TYPES.includes(account.accountType as typeof ACCOUNT_TYPES[number])}
                    <option value={account.accountType}>{account.accountType}</option>
                  {/if}
                  {#each ACCOUNT_TYPES as accountType}
                    <option value={accountType}>{accountType}</option>
                  {/each}
                </select>
              </td>
              <td class="px-6 py-3">
                <label class="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!account.disabled}
                    onchange={(e) => (account.disabled = !(e.target as HTMLInputElement).checked)}
                    class="h-4 w-4 rounded border-accent-300 text-accent-600 focus:ring-accent-400"
                  />
                  <span class="text-sm font-medium {account.disabled ? 'text-gray-400' : 'text-gray-700'}">
                    {account.disabled ? 'Disabled' : 'Active'}
                  </span>
                </label>
              </td>
              <td class="px-6 py-3 text-right">
                <button onclick={() => removeAccount(i)} class="text-gray-400 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          {/each}
          {#if accounts.length === 0}
            <tr>
              <td colspan="4" class="px-6 py-12 text-center text-gray-500">
                No accounts found. Add an account or import transactions to seed accounts automatically.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

<script lang="ts">
  import { financeStore } from '../lib/store.svelte';
  import { formatSignedAmount } from '../lib/formatters';
  import { X, Trash2 } from 'lucide-svelte';
  import type { Transaction } from '../lib/types';
  import { formatDayMonthYear } from '../lib/dateFormat';
  import { collectStatementOptions, compareStatements } from '../lib/statement';
  import { useBackButtonClose } from '../lib/backButtonClose.svelte';
  import { useBodyScrollLock } from '../lib/bodyScrollLock.svelte';
  import TransactionEditModal from './TransactionEditModal.svelte';

  let {
    open = false,
    title,
    transactions = [],
    emptyMessage = 'No entries.',
    onClose,
  }: {
    open?: boolean;
    title: string;
    transactions?: Transaction[];
    emptyMessage?: string;
    onClose?: () => void;
  } = $props();

  useBackButtonClose(
    () => open,
    () => onClose?.()
  );

  useBodyScrollLock(() => open);

  let editingTransaction = $state<Transaction | null>(null);
  let editModalOpen = $state(false);
  let deletingTransactionId = $state<string | null>(null);

  const statementOptions = $derived.by(() => {
    const base = collectStatementOptions(financeStore.transactions);
    const custom = financeStore.statements.map((statement) => statement.value);
    return Array.from(new Set([...base, ...custom])).sort(compareStatements);
  });

  const sorted = $derived(
    [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime())
  );

  const groups = $derived.by(() => {
    const map = new Map<string, Transaction[]>();
    sorted.forEach((transaction) => {
      const key = transaction.date.toDateString();
      const list = map.get(key) ?? [];
      list.push(transaction);
      map.set(key, list);
    });
    return Array.from(map.entries()).map(([key, items]) => ({
      label: `${new Date(key).toLocaleDateString('en-US', {
        weekday: 'long',
      })} · ${formatDayMonthYear(new Date(key))}`,
      transactions: items,
    }));
  });

  function formatAmount(transaction: Transaction): string {
    return formatSignedAmount(
      transaction.value,
      transaction.currencyCode,
      transaction.transactionType
    );
  }

  function editEntry(transaction: Transaction) {
    editingTransaction = transaction;
    editModalOpen = true;
  }

  async function deleteEntry(transaction: Transaction) {
    const confirmed = confirm(
      `Delete "${transaction.note || transaction.category}"?\n\nThis permanently removes the entry. It cannot be undone.`
    );
    if (!confirmed) return;

    deletingTransactionId = transaction.id;
    try {
      await financeStore.deleteTransaction(transaction.id);
      if (editingTransaction?.id === transaction.id) {
        editModalOpen = false;
        editingTransaction = null;
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete transaction.');
    } finally {
      deletingTransactionId = null;
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex flex-col bg-surface">
    <div
      class="flex items-center justify-between border-b border-gray-100 px-5 pb-4"
      style="padding-top: calc(env(safe-area-inset-top, 0px) + 1rem);"
    >
      <h2 class="text-lg font-bold text-gray-900">{title}</h2>
      <button
        type="button"
        onclick={() => onClose?.()}
        class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Close"
      >
        <X size={20} />
      </button>
    </div>

    <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
      {#if sorted.length === 0}
        <p class="pt-10 text-center text-sm text-gray-500">{emptyMessage}</p>
      {/if}

      {#each groups as group (group.label)}
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {group.label}
          </p>
          <div class="space-y-2">
            {#each group.transactions as transaction (transaction.id)}
              <div class="flex items-center gap-2 rounded-2xl border border-gray-100 bg-surface p-3 shadow-sm">
                <button
                  type="button"
                  onclick={() => editEntry(transaction)}
                  class="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold text-gray-900">
                      {transaction.note || transaction.category}
                    </p>
                    <p class="truncate text-xs text-gray-500">
                      {transaction.category} · {transaction.accountName}
                    </p>
                  </div>
                  <p
                    class="flex-shrink-0 font-semibold {transaction.transactionType === 'Income'
                      ? 'text-emerald-500'
                      : 'text-rose-500'}"
                  >
                    {formatAmount(transaction)}
                  </p>
                </button>
                <button
                  type="button"
                  onclick={() => deleteEntry(transaction)}
                  disabled={deletingTransactionId === transaction.id}
                  class="flex-shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Delete entry"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<TransactionEditModal
  transaction={editingTransaction}
  open={editModalOpen}
  mode="edit"
  {statementOptions}
  onClose={() => (editModalOpen = false)}
  onSaved={() => (editModalOpen = false)}
/>

<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import { db } from '../../lib/db';
  import { Plus, Trash2, Save } from 'lucide-svelte';
  import type { Statement } from '../../lib/types';
  import { matchesSearchPattern } from '../../lib/search';
  import { normalizeStatement, compareStatements } from '../../lib/statement';

let statements = $state<Statement[]>(JSON.parse(JSON.stringify(financeStore.statements)));

  let newStatement = $state('');

  let statementError = $state('');

  let statementSearch = $state('');

  const filteredStatements = $derived.by(() => {
    const query = statementSearch.trim();
    if (!query) return statements;
    return statements.filter((statement) =>
      matchesSearchPattern(statement.value, query)
    );
  });

  let isSavingStatements = $state(false);

  function addStatement() {
    const normalized = normalizeStatement(newStatement);
    if (!normalized) {
      statementError = 'Use Mmm-YY format, e.g. Apr-26';
      return;
    }

    if (statements.some((statement) => statement.value === normalized)) {
      statementError = `${normalized} already exists.`;
      return;
    }

    statements = [...statements, { value: normalized }].sort((a, b) =>
      compareStatements(a.value, b.value)
    );
    newStatement = '';
    statementError = '';
  }

  function removeStatement(value: string) {
    statements = statements.filter((statement) => statement.value !== value);
  }

  function handleStatementKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addStatement();
    }
  }

  async function saveStatements() {
    const normalizedStatements: Statement[] = [];
    for (const statement of statements) {
      const normalized = normalizeStatement(statement.value);
      if (!normalized) {
        statementError = `Invalid statement: ${statement.value}. Use Mmm-YY format.`;
        return;
      }
      normalizedStatements.push({ value: normalized });
    }

    const values = normalizedStatements.map((statement) => statement.value);
    if (new Set(values).size !== values.length) {
      statementError = 'Each statement must be unique.';
      return;
    }

    isSavingStatements = true;
    statementError = '';
    try {
      await db.statements.clear();
      await db.statements.bulkPut(normalizedStatements);
      await financeStore.persistAppSettings();
      await financeStore.loadData();
      statements = JSON.parse(JSON.stringify(financeStore.statements));
      alert('Statements saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save statements.');
    }
    isSavingStatements = false;
  }
</script>

  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-surface">
      <div>
        <h2 class="text-xl font-bold text-gray-900">Statement Management</h2>
        <p class="text-sm text-gray-500 mt-1">Create statement periods in <span class="font-semibold text-gray-700">Mmm-YY</span> format, e.g. Apr-26.</p>
      </div>
      <button onclick={saveStatements} disabled={isSavingStatements} class="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-xl hover:bg-accent-500 transition-colors shadow-sm shadow-accent-200 font-medium text-sm disabled:opacity-50 self-start">
        <Save size={16} />
        {isSavingStatements ? 'Saving...' : 'Save Changes'}
      </button>
    </div>

    <div class="p-6 border-b border-accent-50">
      <div class="flex flex-col sm:flex-row gap-3 sm:items-start">
        <div class="flex-1 max-w-xs">
          <input
            type="text"
            bind:value={newStatement}
            onkeydown={handleStatementKeydown}
            placeholder="Apr-26"
            autocomplete="off"
            spellcheck="false"
            class="w-full px-3 py-2 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
          />
          {#if statementError}
            <p class="text-sm text-rose-500 mt-2 font-medium">{statementError}</p>
          {/if}
        </div>
        <button onclick={addStatement} class="flex items-center gap-2 px-4 py-2 bg-surface border border-accent-200 text-gray-700 rounded-xl hover:bg-accent-50 transition-colors shadow-sm font-medium text-sm self-start">
          <Plus size={16} />
          Add Statement
        </button>
      </div>
    </div>

    <div class="p-6 border-b border-accent-50">
      <input
        type="text"
        bind:value={statementSearch}
        placeholder="Search statements..."
        autocomplete="off"
        spellcheck="false"
        class="w-full max-w-xs px-3 py-2 rounded-lg border border-accent-200 focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400 bg-surface"
      />
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse min-w-[360px]">
        <thead>
          <tr class="bg-accent-50/50 text-gray-500 text-sm">
            <th class="px-6 py-4 font-semibold">Statement</th>
            <th class="px-6 py-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-accent-50">
          {#each filteredStatements as statement (statement.value)}
            <tr class="hover:bg-accent-50/30 transition-colors">
              <td class="px-6 py-3 font-semibold text-gray-700">{statement.value}</td>
              <td class="px-6 py-3 text-right">
                <button onclick={() => removeStatement(statement.value)} class="text-gray-400 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50">
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          {/each}
          {#if filteredStatements.length === 0}
            <tr>
              <td colspan="2" class="px-6 py-12 text-center text-gray-500">
                {#if statements.length === 0}
                  No statements yet. Add one above to get started.
                {:else}
                  No statements match your search.
                {/if}
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

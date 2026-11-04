<script lang="ts">
  import TabBar from './TabBar.svelte';
  import CategoryRulesTab from './settings/CategoryRulesTab.svelte';
  import AccountsTab from './settings/AccountsTab.svelte';
  import StatementsTab from './settings/StatementsTab.svelte';
  import BudgetsTab from './settings/BudgetsTab.svelte';
  import QuickAddTab from './settings/QuickAddTab.svelte';
  import ScheduledTab from './settings/ScheduledTab.svelte';
  import DataTab from './settings/DataTab.svelte';

  type SettingsTab =
    | 'rules'
    | 'accounts'
    | 'statements'
    | 'monthlyBudgets'
    | 'quickAdd'
    | 'scheduled'
    | 'data';

  let activeTab = $state<SettingsTab>('rules');

  const tabs = [
    { id: 'rules' as const, label: 'Category Rules' },
    { id: 'accounts' as const, label: 'Account' },
    { id: 'statements' as const, label: 'Statement Management' },
    { id: 'monthlyBudgets' as const, label: 'Budgets' },
    { id: 'quickAdd' as const, label: 'Quick Add Buttons' },
    { id: 'scheduled' as const, label: 'Scheduled' },
    { id: 'data' as const, label: 'Data Management' },
  ];
</script>

<div class="space-y-6">
  <TabBar {tabs} bind:active={activeTab} />

  {#if activeTab === 'rules'}
    <CategoryRulesTab />
  {:else if activeTab === 'accounts'}
    <AccountsTab />
  {:else if activeTab === 'statements'}
    <StatementsTab />
  {:else if activeTab === 'monthlyBudgets'}
    <BudgetsTab />
  {:else if activeTab === 'quickAdd'}
    <QuickAddTab />
  {:else if activeTab === 'scheduled'}
    <ScheduledTab />
  {:else}
    <DataTab />
  {/if}
</div>

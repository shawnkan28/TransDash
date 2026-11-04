<script lang="ts">
  import { Plane, CalendarDays, CalendarRange, Wallet } from 'lucide-svelte';
  import TabBar from './TabBar.svelte';
  import TravelBudgetTab from './budget/TravelBudgetTab.svelte';
  import DailyBudgetTab from './budget/DailyBudgetTab.svelte';
  import MonthlyBudgetTab from './budget/MonthlyBudgetTab.svelte';
  import YearlyBudgetTab from './budget/YearlyBudgetTab.svelte';

  type BudgetTab = 'travel' | 'daily' | 'monthly' | 'yearly';

  let activeTab = $state<BudgetTab>('travel');

  const tabs = [
    { id: 'travel' as const, label: 'Travel Budget', icon: Plane },
    { id: 'daily' as const, label: 'Daily Spendings', icon: CalendarDays },
    { id: 'monthly' as const, label: 'Monthly Budget', icon: Wallet },
    { id: 'yearly' as const, label: 'Yearly Budget', icon: CalendarRange },
  ];
</script>

<div class="space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="text-[28px] font-bold tracking-tight text-gray-900">Budget &amp; Expense</h1>
      <p class="text-sm text-gray-500">Set and track yearly spending budgets.</p>
    </div>
  </div>

  <TabBar {tabs} bind:active={activeTab} />

  <!-- Only the visible tab is mounted, so switching away tears down its
       charts and derived computations rather than leaving them running. -->
  {#if activeTab === 'travel'}
    <TravelBudgetTab />
  {:else if activeTab === 'daily'}
    <DailyBudgetTab />
  {:else if activeTab === 'monthly'}
    <MonthlyBudgetTab />
  {:else}
    <YearlyBudgetTab />
  {/if}
</div>

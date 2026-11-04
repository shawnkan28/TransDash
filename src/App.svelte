<script lang="ts">
  import { onMount } from 'svelte';
  import { financeStore } from './lib/store.svelte';
  import { isUnassignedStatement } from './lib/statement';
  import { viewport } from './lib/viewport.svelte';
  import { theme } from './lib/theme.svelte';
  import DataLoader from './components/DataLoader.svelte';
  import LazyRoute from './components/LazyRoute.svelte';
  import MobileBudgetSummary from './components/MobileBudgetSummary.svelte';
  import MobileQuickAdd from './components/MobileQuickAdd.svelte';

  // The mobile dashboard and quick-add are imported eagerly because a phone
  // needs them immediately. Every other screen is desktop-only (the sidebar
  // that reaches them is `hidden md:flex`), so it is fetched on first use.
  const screens = {
    dashboard: () => import('./components/Dashboard.svelte'),
    review: () => import('./components/Review.svelte'),
    transactions: () => import('./components/Transactions.svelte'),
    budget: () => import('./components/Budget.svelte'),
    settings: () => import('./components/Settings.svelte'),
  };
  import {
    LayoutDashboard,
    PieChart,
    ArrowRightLeft,
    Wallet,
    FileText,
    Target,
    HelpCircle,
    Settings as SettingsIcon,
    Moon,
    LogOut,
    Bell,
    Calendar,
    ChevronDown,
    Zap,
    Eye
  } from 'lucide-svelte';

  let currentTab = $state<'dashboard' | 'review' | 'transactions' | 'budget' | 'settings'>('dashboard');

  const reviewEntryCount = $derived(
    financeStore.transactions.filter((transaction) =>
      isUnassignedStatement(transaction.statement)
    ).length
  );

  onMount(() => {
    financeStore.loadData();
  });
</script>

<div class="flex h-screen bg-transparent text-gray-900 font-sans overflow-hidden antialiased">
  
  <!-- Sidebar -->
  <aside class="w-64 bg-surface/40 backdrop-blur-md border-r border-gray-200 flex-col hidden md:flex flex-shrink-0 overflow-y-auto">
    <div class="p-6 flex items-center gap-3">
      <div class="brand-mark text-white p-2 rounded-[10px] flex items-center justify-center">
        <Zap size={20} fill="currentColor" />
      </div>
      <span class="font-display font-bold text-2xl tracking-tight">TransDash</span>
    </div>

    <div class="px-6 mb-6">
      <div class="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors">
        <img src="https://ui-avatars.com/api/?name=Peter+Parker&background=random" alt="Avatar" class="w-10 h-10 rounded-full bg-gray-200" />
        <div class="flex-1 overflow-hidden">
          <p class="font-semibold text-sm truncate">Peter Parker</p>
          <p class="text-xs text-gray-500 truncate">Personal Account</p>
        </div>
        <ChevronDown size={16} class="text-gray-400" />
      </div>
    </div>

    <nav class="flex-1 px-4 space-y-1">
      <div class="px-2 mb-2">
        <span class="text-xs font-semibold text-gray-400 tracking-wider">MENU</span>
      </div>
      
      <button 
        onclick={() => currentTab = 'dashboard'}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors {currentTab === 'dashboard' ? 'bg-accent-100 text-accent-700' : 'text-gray-600 hover:bg-gray-100'}"
      >
        <LayoutDashboard size={20} />
        Dashboard
      </button>

      <button
        onclick={() => (currentTab = 'review')}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors {currentTab === 'review' ? 'bg-accent-100 text-accent-700' : 'text-gray-600 hover:bg-gray-100'}"
      >
        <Eye size={20} />
        <span class="flex-1 text-left">Review</span>
        {#if reviewEntryCount > 0}
          <span
            class="min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none
                   {currentTab === 'review' ? 'bg-accent-600 text-white' : 'bg-rose-100 text-rose-600'}"
          >
            {reviewEntryCount}
          </span>
        {/if}
      </button>

      <button 
        onclick={() => currentTab = 'transactions'}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors {currentTab === 'transactions' ? 'bg-accent-100 text-accent-700' : 'text-gray-600 hover:bg-gray-100'}"
      >
        <ArrowRightLeft size={20} />
        Transactions
      </button>

      <button
        onclick={() => currentTab = 'budget'}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors {currentTab === 'budget' ? 'bg-accent-100 text-accent-700' : 'text-gray-600 hover:bg-gray-100'}"
      >
        <Wallet size={20} />
        Budget & Expense
      </button>

      <button disabled class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 opacity-50 cursor-not-allowed">
        <PieChart size={20} />
        Investment
      </button>

      <button disabled class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 opacity-50 cursor-not-allowed">
        <FileText size={20} />
        Invoices
      </button>

      <button disabled class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 opacity-50 cursor-not-allowed">
        <Target size={20} />
        Goals & Savings
      </button>

      <div class="px-2 mt-8 mb-2">
        <span class="text-xs font-semibold text-gray-400 tracking-wider">OTHERS</span>
      </div>

      <button disabled class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 opacity-50 cursor-not-allowed">
        <HelpCircle size={20} />
        Help Center
      </button>

      <button 
        onclick={() => currentTab = 'settings'}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors {currentTab === 'settings' ? 'bg-accent-100 text-accent-700' : 'text-gray-600 hover:bg-gray-100'}"
      >
        <SettingsIcon size={20} />
        Settings
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={theme.isDark}
        onclick={() => theme.toggle()}
        class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors"
      >
        <span class="flex items-center gap-3 text-sm font-medium text-gray-600">
          <Moon size={20} />
          Dark Mode
        </span>
        <span
          class="w-10 h-6 rounded-full relative transition-colors {theme.isDark ? 'bg-accent-600' : 'bg-gray-200'}"
        >
          <span
            class="w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all {theme.isDark ? 'left-5' : 'left-1'}"
          ></span>
        </span>
      </button>
    </nav>

    <div class="p-4 mt-auto">
      <button disabled class="flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-500 w-full rounded-xl opacity-50 cursor-not-allowed">
        <LogOut size={20} />
        Logout
      </button>
    </div>
  </aside>

  <!-- Main Content -->
  <div class="flex-1 flex flex-col overflow-hidden relative">
    
    <!-- Top Header -->
    <header class="hidden md:flex h-20 bg-transparent items-center justify-end px-8 flex-shrink-0 z-10">
      <div class="flex items-center gap-4">
        <button disabled class="w-10 h-10 rounded-full bg-surface border border-gray-200 flex items-center justify-center text-gray-500 relative opacity-50 cursor-not-allowed">
          <Bell size={20} />
          <div class="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-surface"></div>
        </button>
        <button disabled class="flex items-center gap-2 px-4 py-2 bg-surface border border-gray-200 rounded-xl text-sm font-medium text-gray-700 opacity-50 cursor-not-allowed">
          <Calendar size={16} class="text-gray-400" />
          February 2025
          <ChevronDown size={16} class="text-gray-400 ml-1" />
        </button>
      </div>
    </header>

    <main class="flex-1 overflow-y-auto px-8 pb-8 pt-2">
      {#if financeStore.loading}
        <div class="flex justify-center items-center h-full">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div>
        </div>
      {:else if currentTab === 'settings'}
        <LazyRoute load={screens.settings} />
      {:else if financeStore.transactions.length === 0}
        <DataLoader />
      {:else if currentTab === 'review'}
        <LazyRoute load={screens.review} />
      {:else if currentTab === 'transactions'}
        <LazyRoute load={screens.transactions} />
      {:else if currentTab === 'budget'}
        <LazyRoute load={screens.budget} />
      {:else if viewport.isMobile}
        <MobileBudgetSummary />
      {:else}
        <LazyRoute load={screens.dashboard} />
      {/if}
    </main>

    {#if viewport.isMobile && !financeStore.loading && financeStore.transactions.length > 0}
      <MobileQuickAdd />
    {/if}
  </div>
</div>

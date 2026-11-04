<script lang="ts" generics="T extends string">
  /**
   * The underlined tab strip used by Budget and Settings. Both had the same
   * ~10 lines of button markup repeated once per tab — ten copies in total.
   */
  let {
    tabs,
    active = $bindable(),
  }: {
    // lucide-svelte exports legacy component classes, which don't satisfy
    // Svelte 5's `Component` type — same reason StatCard types its icon `any`.
    tabs: { id: T; label: string; icon?: any }[];
    active: T;
  } = $props();
</script>

<div class="flex items-center gap-6 overflow-x-auto border-b border-gray-200">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      onclick={() => (active = tab.id)}
      class="flex shrink-0 items-center gap-2 border-b-2 px-2 pb-3 text-sm font-bold transition-colors
             {active === tab.id
        ? 'border-accent-600 text-accent-600'
        : 'border-transparent text-gray-500 hover:text-gray-800'}"
    >
      {#if tab.icon}
        {@const Icon = tab.icon}
        <Icon size={16} />
      {/if}
      {tab.label}
    </button>
  {/each}
</div>

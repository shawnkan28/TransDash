<script lang="ts">
  import { untrack } from 'svelte';

  /**
   * Mounts a screen that is loaded on demand.
   *
   * Everything except the mobile dashboard is reachable only from the desktop
   * sidebar, but a static import put all of it — including chart.js, the
   * single heaviest dependency — into the bundle every phone downloads before
   * it can paint anything.
   */
  let { load }: { load: () => Promise<{ default: any }> } = $props();

  // Resolved once per mount, not per render: `load` is fixed for the lifetime
  // of each mount, and re-invoking it on every render would restart the await
  // block. Vite caches the module, so returning to a screen does not re-fetch.
  const pending = untrack(() => load());
</script>

{#await pending}
  <div class="flex h-full items-center justify-center py-16">
    <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-accent-500"></div>
  </div>
{:then module}
  {@const Screen = module.default}
  <Screen />
{:catch}
  <p class="py-16 text-center text-sm text-rose-500">
    Could not load this screen. Please reload the page.
  </p>
{/await}

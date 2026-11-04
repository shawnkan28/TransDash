<script lang="ts">
  import { ChevronDown, Search, X } from 'lucide-svelte';
  import { matchesSearchPattern } from '../lib/search';
  import { isMobileViewport } from '../lib/viewport.svelte';
  import { focusOnMount } from '../lib/focus';
  import { useBackButtonClose } from '../lib/backButtonClose.svelte';
  import { useBodyScrollLock } from '../lib/bodyScrollLock.svelte';

  let {
    value = $bindable(''),
    options = [],
    formatLabel = (option: string) => option,
    placeholder = 'Search...',
    disabled = false,
    clearable = true,
    class: className = '',
    onchange,
  }: {
    value?: string;
    options?: string[];
    formatLabel?: (option: string) => string;
    placeholder?: string;
    disabled?: boolean;
    /** Offers a blank "— None —" choice. Turn off where an empty value means nothing. */
    clearable?: boolean;
    class?: string;
    onchange?: (value: string) => void;
  } = $props();

  let query = $state('');
  let open = $state(false);
  let menuStyle = $state('');
  let menuMaxHeight = $state(256);
  let keyboardInset = $state(0);
  let sheetMaxHeight = $state(320);
  let container: HTMLDivElement;
  let inputEl: HTMLInputElement;

  const MAX_DROPDOWN_HEIGHT = 256;

  // The mobile sheet is a modal overlay, so it gets the same back-button and
  // scroll-lock treatment as the app's other sheets. Desktop keeps its
  // lightweight anchored popover, which tracks its anchor on scroll instead.
  useBackButtonClose(
    () => open && isMobileViewport(),
    () => (open = false)
  );
  useBodyScrollLock(() => open && isMobileViewport());

  function updateMenuPosition() {
    if (!inputEl) return;
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropUp = spaceBelow < MAX_DROPDOWN_HEIGHT && spaceAbove > spaceBelow;

    menuMaxHeight = Math.max(
      120,
      Math.min(MAX_DROPDOWN_HEIGHT, (dropUp ? spaceAbove : spaceBelow) - 12)
    );

    const top = dropUp ? Math.max(4, rect.top - menuMaxHeight - 4) : rect.bottom + 4;
    menuStyle = `position: fixed; left: ${rect.left}px; width: ${rect.width}px; top: ${top}px;`;
  }

  /**
   * window.visualViewport reports the area still visible once the on-screen
   * keyboard is up (window.innerHeight does not shrink for it), so the sheet
   * can sit directly on top of the keyboard rather than behind it.
   */
  function updateSheetMetrics() {
    const viewport = window.visualViewport;
    if (viewport) {
      keyboardInset = Math.max(
        0,
        window.innerHeight - (viewport.height + viewport.offsetTop)
      );
      sheetMaxHeight = Math.max(200, viewport.height - 12);
    } else {
      keyboardInset = 0;
      sheetMaxHeight = Math.max(200, Math.round(window.innerHeight * 0.6));
    }
  }

  function updatePosition() {
    updateMenuPosition();
    updateSheetMetrics();
  }

  function computeFilteredOptions(rawQuery: string) {
    const normalizedQuery = rawQuery.trim();
    if (!normalizedQuery) return options;

    return options.filter((option) =>
      matchesSearchPattern(formatLabel(option), normalizedQuery)
    );
  }

  const filteredOptions = $derived(computeFilteredOptions(query));

  // Only while browsing; once you type, Enter should still pick the first match.
  const showBlank = $derived(clearable && !query.trim());

  $effect(() => {
    value;
    if (!open) {
      query = formatLabel(value);
    }
  });

  $effect(() => {
    if (!open) return;

    const reposition = () => updatePosition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);

    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
    };
  });

  function openDropdown() {
    if (disabled) return;
    updatePosition();
    open = true;
    query = '';
  }

  function selectOption(option: string) {
    value = option;
    query = formatLabel(option);
    open = false;
    onchange?.(option);
  }

  function handleInput(event: Event) {
    const nextQuery = (event.currentTarget as HTMLInputElement).value;
    query = nextQuery;
    updateMenuPosition();
    open = true;

    const matches = computeFilteredOptions(nextQuery);
    if (nextQuery.trim() && matches.length === 1) {
      selectOption(matches[0]);
    }
  }

  function handleSheetInput(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
  }

  function handleSheetKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        selectOption(filteredOptions[0]);
      }
      return;
    }

    if (event.key === 'Escape') {
      open = false;
    }
  }

  function handleBlur(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && container.contains(next)) return;
    open = false;
    query = formatLabel(value);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        selectOption(filteredOptions[0]);
      }
      return;
    }

    if (event.key === 'Escape') {
      open = false;
      query = formatLabel(value);
    }
  }
</script>

<div class="relative {className}" bind:this={container}>
  <!-- Desktop: the field itself is the search box, with an anchored dropdown -->
  <div class="relative hidden md:block">
    <input
      bind:this={inputEl}
      type="text"
      value={query}
      {placeholder}
      {disabled}
      autocomplete="off"
      spellcheck="false"
      class="w-full rounded-xl border border-gray-200 bg-surface px-4 py-2.5 pr-9 text-sm font-semibold text-gray-700 transition-colors
             focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-gray-50"
      onfocus={openDropdown}
      onclick={openDropdown}
      oninput={handleInput}
      onblur={handleBlur}
      onkeydown={handleKeydown}
    />
    <ChevronDown size={14} class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
  </div>

  <!-- Mobile: the field opens a picker sheet that sits above the keyboard -->
  <button
    type="button"
    {disabled}
    onclick={openDropdown}
    class="flex md:hidden w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-left text-sm transition-colors
           focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-gray-50"
  >
    <span class="truncate {value ? 'font-semibold text-gray-700' : 'font-normal text-gray-400'}">
      {value ? formatLabel(value) : placeholder}
    </span>
    <ChevronDown size={14} class="flex-shrink-0 text-gray-400" />
  </button>

  {#if open}
    <div
      class="z-50 hidden md:block min-w-[12rem] overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-lg"
      style={menuStyle}
    >
      <ul
        class="overflow-y-auto py-1"
        style={`max-height: ${menuMaxHeight}px`}
        role="listbox"
      >
        {#if showBlank}
          <li>
            <button
              type="button"
              class="w-full px-4 py-2 text-left text-sm italic text-gray-400 transition-colors hover:bg-gray-50
                     {value === '' ? 'bg-accent-50' : ''}"
              onmousedown={(event) => event.preventDefault()}
              onclick={() => selectOption('')}
            >
              — None —
            </button>
          </li>
        {/if}
        {#each filteredOptions as option (option)}
          <li>
            <button
              type="button"
              class="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50
                     {value === option ? 'bg-accent-50 font-bold text-accent-600' : ''}"
              onmousedown={(event) => event.preventDefault()}
              onclick={() => selectOption(option)}
            >
              {formatLabel(option)}
            </button>
          </li>
        {:else}
          <li class="px-4 py-2 text-sm text-gray-500">No matches found</li>
        {/each}
      </ul>
    </div>

    <div class="md:hidden fixed inset-0 z-50">
      <button
        type="button"
        class="absolute inset-0 bg-black/30"
        aria-label="Close"
        onclick={() => (open = false)}
      ></button>

      <div
        class="absolute inset-x-0 flex flex-col overflow-hidden rounded-t-2xl border-t border-gray-100 bg-surface shadow-[0_-8px_30px_-8px_rgba(0,0,0,0.25)]"
        style={`bottom: ${keyboardInset}px; max-height: ${sheetMaxHeight}px;`}
      >
        <div class="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-3">
          <div class="relative flex-1">
            <Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              use:focusOnMount={{ select: true }}
              type="text"
              value={query}
              placeholder="Search..."
              autocomplete="off"
              spellcheck="false"
              class="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm font-medium text-gray-700
                     focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
              oninput={handleSheetInput}
              onkeydown={handleSheetKeydown}
            />
          </div>
          <button
            type="button"
            onclick={() => (open = false)}
            class="flex-shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <ul class="flex-1 overflow-y-auto overscroll-contain py-1" role="listbox">
          {#if showBlank}
            <li>
              <button
                type="button"
                onclick={() => selectOption('')}
                class="w-full px-4 py-3 text-left text-sm italic text-gray-400 transition-colors active:bg-gray-50
                       {value === '' ? 'bg-accent-50' : ''}"
              >
                — None —
              </button>
            </li>
          {/if}
          {#each filteredOptions as option (option)}
            <li>
              <button
                type="button"
                onclick={() => selectOption(option)}
                class="w-full px-4 py-3 text-left text-sm transition-colors active:bg-gray-50
                       {value === option ? 'bg-accent-50 font-bold text-accent-600' : 'font-medium text-gray-700'}"
              >
                {formatLabel(option)}
              </button>
            </li>
          {:else}
            <li class="px-4 py-3 text-sm text-gray-500">No matches found</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>

<script lang="ts">
  let {
    value = $bindable(''),
    options = [],
    formatLabel = (option: string) => option,
    placeholder = '',
    disabled = false,
    class: className = '',
    onchange,
  }: {
    value?: string;
    options?: string[];
    formatLabel?: (option: string) => string;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
    onchange?: (value: string) => void;
  } = $props();

  function handleChange(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    value = next;
    onchange?.(next);
  }
</script>

<select
  {value}
  {disabled}
  class="rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors
         focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-gray-50 {className}"
  onchange={handleChange}
>
  {#if placeholder}
    <option value="">{placeholder}</option>
  {/if}
  {#each options as option (option)}
    <option value={option}>{formatLabel(option)}</option>
  {/each}
</select>

<script lang="ts">
  import { financeStore } from '../../lib/store.svelte';
  import {
    Upload,
    DatabaseBackup,
    TriangleAlert,
    Archive,
    FileCode,
    Download,
    RotateCcw,
    Trash2,
  } from 'lucide-svelte';
  import { parseTransactions } from '../../lib/parser';
  import { formatDayMonthYear } from '../../lib/dateFormat';
  import {
    fetchCsvImportStatus,
    runCsvImport,
    fetchBackups,
    createBackupApi,
    restoreBackupApi,
    deleteBackupApi,
    backupDownloadUrl,
    fetchExports,
    createExport,
    deleteExportApi,
    exportDownloadUrl,
    type BackupInfo,
    type SqlExport,
    type CsvImportResult,
    type CsvImportStatus,
  } from '../../lib/api';

  let isUploading = $state(false);
  let uploadError = $state('');

  let importStatus = $state<CsvImportStatus | null>(null);
  let isImporting = $state(false);
  let importError = $state('');
  let importResult = $state<CsvImportResult | null>(null);

  let exports = $state<SqlExport[]>([]);
  let suggestedName = $state('transdash-export.sql');
  let exportName = $state('');
  let isExporting = $state(false);
  let exportError = $state('');
  let lastExport = $state<SqlExport | null>(null);

  let backups = $state<BackupInfo[]>([]);
  let backupKeep = $state(14);
  let scheduleEnabled = $state(true);
  let backupHour = $state(0);
  let timeZone = $state('UTC');
  let dailyName = $state('transdash.backup.sql');
  let nextScheduled = $state<string | null>(null);
  let isBackingUp = $state(false);
  let isRestoring = $state(false);
  let backupError = $state('');

  // Loaded once so the buttons can say what they would do before doing it.
  $effect(() => {
    void refreshImportStatus();
    void refreshBackups();
    void refreshExports();
  });

  async function refreshExports() {
    try {
      const result = await fetchExports();
      exports = result.exports;
      suggestedName = result.suggestedName;
    } catch {
      exports = [];
    }
  }

  async function handleGenerateExport(overwrite = false) {
    isExporting = true;
    exportError = '';
    try {
      lastExport = await createExport(exportName.trim() || suggestedName, overwrite);
      exportName = '';
      await refreshExports();
    } catch (err) {
      const error = err as Error & { code?: string };
      // A name clash is worth asking about rather than just refusing.
      if (error.code === 'EXISTS' && !overwrite) {
        isExporting = false;
        if (confirm(`${error.message}\n\nReplace it?`)) {
          await handleGenerateExport(true);
        }
        return;
      }
      exportError = error.message || 'Could not generate the file.';
    }
    isExporting = false;
  }

  async function handleDeleteExport(file: SqlExport) {
    if (!confirm(`Delete data/${file.name}?`)) return;
    try {
      await deleteExportApi(file.name);
      if (lastExport?.name === file.name) lastExport = null;
      await refreshExports();
    } catch (err) {
      exportError = err instanceof Error ? err.message : 'Could not delete that file.';
    }
  }

  async function refreshBackups() {
    try {
      const result = await fetchBackups();
      backups = result.backups;
      backupKeep = result.keep;
      scheduleEnabled = result.scheduleEnabled;
      backupHour = result.backupHour;
      timeZone = result.timeZone;
      dailyName = result.dailyName;
      nextScheduled = result.nextScheduled;
    } catch {
      backups = [];
    }
  }

  const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  /** An instant as the server's timezone sees it — the zone the schedule uses. */
  function serverTime(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', { ...TIME_OPTIONS, timeZone });
  }

  /** The same instant in the viewer's own timezone. */
  function localTime(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', TIME_OPTIONS);
  }

  /** Only worth showing both when the two zones disagree. */
  function browserDiffers(iso: string): boolean {
    return serverTime(iso) !== localTime(iso);
  }

  /** The trailing word in a backup filename says why it was taken. */
  function backupLabel(name: string): string {
    const match = /-(daily|manual|pre-import|pre-restore)\.sql$/.exec(name);
    return match ? match[1].replace('-', ' ') : 'backup';
  }

  async function handleBackupNow() {
    isBackingUp = true;
    backupError = '';
    try {
      await createBackupApi();
      await refreshBackups();
    } catch (err) {
      backupError = err instanceof Error ? err.message : 'Could not create a backup.';
    }
    isBackingUp = false;
  }

  async function handleRestore(backup: BackupInfo) {
    const when = new Date(backup.created).toLocaleString();
    if (
      !confirm(
        `Restore the database from the backup taken ${when}?\n\n` +
          `Everything currently stored is replaced. The current state is saved ` +
          `as a "pre restore" backup first, so this can be undone.`
      )
    ) {
      return;
    }

    isRestoring = true;
    backupError = '';
    try {
      const result = await restoreBackupApi(backup.name);
      await financeStore.loadData();
      await refreshBackups();
      await refreshImportStatus();
      alert(
        `Restored ${result.restoredRows.toLocaleString()} transactions.` +
          (result.safetyBackup ? `\n\nPrevious state saved as ${result.safetyBackup}` : '')
      );
    } catch (err) {
      backupError = err instanceof Error ? err.message : 'Restore failed.';
    }
    isRestoring = false;
  }

  async function handleDeleteBackup(backup: BackupInfo) {
    if (!confirm(`Delete the backup from ${new Date(backup.created).toLocaleString()}?`)) return;
    try {
      await deleteBackupApi(backup.name);
      await refreshBackups();
    } catch (err) {
      backupError = err instanceof Error ? err.message : 'Could not delete that backup.';
    }
  }

  async function refreshImportStatus() {
    try {
      importStatus = await fetchCsvImportStatus();
    } catch {
      importStatus = null;
    }
  }

  async function handleTransactionUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    isUploading = true;
    uploadError = '';
    try {
      await parseTransactions(file);
      await financeStore.loadData();
      alert('Transactions imported successfully!');
    } catch (err) {
      console.error(err);
      uploadError = 'Error parsing transactions.';
    }
    isUploading = false;
    (e.target as HTMLInputElement).value = '';
  }

  async function handleCsvImport() {
    if (!importStatus?.csvAvailable) return;

    const confirmed = confirm(
      `Rebuild the database from data/data.csv?\n\n` +
        `This REPLACES everything currently stored:\n` +
        `  • ${importStatus.currentRows} transactions -> ${importStatus.csvRows} from the CSV\n` +
        `  • all categories, accounts, statements and budgets, from settings.json\n\n` +
        `A copy of the current database is saved first, and nothing is written ` +
        `unless the import verifies.`
    );
    if (!confirmed) return;

    isImporting = true;
    importError = '';
    importResult = null;
    try {
      importResult = await runCsvImport();
      await financeStore.loadData();
      await refreshImportStatus();
    } catch (err) {
      console.error(err);
      importError = err instanceof Error ? err.message : 'Import failed.';
    }
    isImporting = false;
  }
</script>

<div class="space-y-6">
  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 bg-surface">
      <h2 class="text-xl font-bold text-gray-900">Data Management</h2>
      <p class="text-sm text-gray-500 mt-1">Import new transaction data from a CSV file.</p>
    </div>
    <div class="p-6">
      <div class="border-2 border-dashed border-accent-200 rounded-2xl p-8 text-center hover:border-accent-600 transition-colors bg-accent-50/30">
        <label class="block cursor-pointer">
          <div class="w-12 h-12 bg-accent-100 text-accent-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Upload size={24} />
          </div>
          <span class="block text-base font-bold text-gray-900 mb-2">Upload Transactions CSV</span>
          <span class="text-sm text-gray-500 mb-6 block max-w-md mx-auto">Upload your bank statement or exported transaction list. It will automatically categorize based on your configuration rules.</span>
          <input type="file" accept=".csv" onchange={handleTransactionUpload} disabled={isUploading} class="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-accent-600 file:text-white hover:file:bg-accent-600 mx-auto max-w-xs transition-colors cursor-pointer disabled:opacity-50" />
        </label>
        {#if uploadError}
          <p class="text-sm text-rose-500 mt-4 font-bold">{uploadError}</p>
        {/if}
        {#if isUploading}
          <p class="text-sm text-accent-600 mt-4 font-bold">Uploading and parsing your data...</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- On-demand SQL dump into the data folder. -->
  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 bg-surface">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 text-accent-600"><FileCode size={20} /></div>
        <div>
          <h2 class="text-xl font-bold text-gray-900">Generate a SQL file</h2>
          <p class="text-sm text-gray-500 mt-1">
            Writes a dump of the whole database into the
            <code class="rounded bg-gray-100 px-1 py-0.5 text-xs">data</code> folder.
            Separate from the daily backup, so it is yours to keep, move or delete.
          </p>
        </div>
      </div>
    </div>

    <div class="p-6 space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex-1">
          <label for="export-name" class="mb-1 block text-xs font-semibold text-gray-500">
            File name
          </label>
          <div class="flex items-center gap-2">
            <span class="shrink-0 text-sm text-gray-400">data/</span>
            <input
              id="export-name"
              type="text"
              bind:value={exportName}
              placeholder={suggestedName}
              spellcheck="false"
              class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            />
          </div>
          <p class="mt-1 text-xs text-gray-400">
            Letters, numbers, dots, dashes and underscores. <code>.sql</code> is added if you leave it off.
          </p>
        </div>
        <button
          onclick={() => handleGenerateExport()}
          disabled={isExporting}
          class="flex shrink-0 items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-accent-500 disabled:opacity-50"
        >
          <FileCode size={16} />
          {isExporting ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {#if exportError}
        <p class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-600">
          {exportError}
        </p>
      {/if}

      {#if lastExport}
        <p class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Written to <code class="rounded bg-surface px-1 py-0.5 text-xs">data/{lastExport.name}</code>
          ({(lastExport.bytes / 1024 / 1024).toFixed(2)} MB)
        </p>
      {/if}

      {#if exports.length > 0}
        <ul class="divide-y divide-gray-50 border-t border-gray-50 pt-1">
          {#each exports as file (file.name)}
            <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-gray-900">{file.name}</p>
                <p class="text-xs text-gray-500">
                  {formatDayMonthYear(new Date(file.created))}
                  {new Date(file.created).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  · {(file.bytes / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <a
                  href={exportDownloadUrl(file.name)}
                  download
                  class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download size={14} />
                  Download
                </a>
                <button
                  onclick={() => handleDeleteExport(file)}
                  aria-label="Delete file"
                  class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Snapshots of the database. -->
  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-accent-100 overflow-hidden">
    <div class="p-6 border-b border-accent-50 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 text-accent-600"><Archive size={20} /></div>
        <div>
          <h2 class="text-xl font-bold text-gray-900">Backups</h2>
          <p class="text-sm text-gray-500 mt-1">
            {#if scheduleEnabled}
              <code class="rounded bg-gray-100 px-1 py-0.5 text-xs">data/{dailyName}</code>
              is rewritten every day at
              {String(backupHour).padStart(2, '0')}:00 <span class="font-semibold">{timeZone}</span>,
              and whenever you press the button.
            {:else}
              The daily backup is switched off. Press the button to write
              <code class="rounded bg-gray-100 px-1 py-0.5 text-xs">data/{dailyName}</code> by hand.
            {/if}
            Undo points are kept separately before any import or restore — the {backupKeep}
            most recent. All of them are plain SQL that replays into a fresh database.
          </p>
          {#if scheduleEnabled && nextScheduled}
            <p class="mt-1 text-xs text-gray-400">
              Next run {serverTime(nextScheduled)} {timeZone}
              {#if browserDiffers(nextScheduled)}
                <span class="text-gray-300">·</span>
                {localTime(nextScheduled)} your time
              {/if}
            </p>
          {/if}
        </div>
      </div>
      <button
        onclick={handleBackupNow}
        disabled={isBackingUp}
        class="flex shrink-0 items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-accent-500 disabled:opacity-50"
      >
        <Archive size={16} />
        {isBackingUp ? 'Backing up…' : 'Back up now'}
      </button>
    </div>

    <div class="p-6">
      {#if backupError}
        <p class="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-600">
          {backupError}
        </p>
      {/if}

      {#if backups.length === 0}
        <p class="text-sm text-gray-500">No backups yet. Press <span class="font-semibold">Back up now</span> to take one.</p>
      {:else}
        <ul class="divide-y divide-gray-50">
          {#each backups as backup (backup.name)}
            <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-900">
                  {backup.daily ? backup.name : formatDayMonthYear(new Date(backup.created))}
                  <span class="font-normal text-gray-500">
                    {new Date(backup.created).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                    {backupLabel(backup.name)}
                  </span>
                  {#if backup.daily}
                    <span class="ml-1 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                      daily
                    </span>
                  {/if}
                </p>
                <p class="text-xs text-gray-500">{(backup.bytes / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <a
                  href={backupDownloadUrl(backup.name)}
                  download
                  class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download size={14} />
                  Download
                </a>
                <button
                  onclick={() => handleRestore(backup)}
                  disabled={isRestoring}
                  class="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Restore
                </button>
                {#if !backup.daily}
                  <button
                    onclick={() => handleDeleteBackup(backup)}
                    aria-label="Delete backup"
                    class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 size={14} />
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Rebuild from the files the app used before the SQLite move. -->
  <div class="bg-surface rounded-[20px] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-amber-200 overflow-hidden">
    <div class="p-6 border-b border-amber-100 bg-amber-50/40">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 text-amber-600"><DatabaseBackup size={20} /></div>
        <div>
          <h2 class="text-xl font-bold text-gray-900">Re-import from data.csv</h2>
          <p class="text-sm text-gray-600 mt-1">
            Rebuilds the SQLite database from the old <code class="rounded bg-surface px-1 py-0.5 text-xs">data/data.csv</code>
            and <code class="rounded bg-surface px-1 py-0.5 text-xs">settings.json</code> files on the server.
            Use this to recover the pre-SQLite data, not for day-to-day imports.
          </p>
        </div>
      </div>
    </div>

    <div class="p-6 space-y-4">
      {#if importStatus === null}
        <p class="text-sm text-gray-500">Checking what is available…</p>
      {:else if !importStatus.csvAvailable}
        <p class="text-sm text-gray-500">
          No <code class="rounded bg-gray-100 px-1 py-0.5 text-xs">data/data.csv</code> on the server, so there is nothing to import.
        </p>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">In the database now</p>
            <p class="mt-1 text-2xl font-bold text-gray-900">{importStatus.currentRows.toLocaleString()}</p>
            <p class="text-xs text-gray-500">transactions</p>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">In data.csv</p>
            <p class="mt-1 text-2xl font-bold text-gray-900">{importStatus.csvRows.toLocaleString()}</p>
            <p class="text-xs text-gray-500">
              {#if importStatus.csvModified}
                last written {formatDayMonthYear(new Date(importStatus.csvModified))}
              {:else}
                transactions
              {/if}
            </p>
          </div>
        </div>

        <div class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div class="mt-0.5 shrink-0 text-amber-600"><TriangleAlert size={16} /></div>
          <p class="text-xs text-amber-900">
            This replaces every table, including your categories, accounts and budgets.
            The current database is copied aside first, and the import verifies row count,
            value total and every id before it commits — if any check fails, nothing is written.
          </p>
        </div>

        <button
          onclick={handleCsvImport}
          disabled={isImporting}
          class="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <DatabaseBackup size={16} />
          {isImporting ? 'Importing…' : 'Re-import from data.csv'}
        </button>
      {/if}

      {#if importError}
        <p class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-600">
          {importError}
        </p>
      {/if}

      {#if importResult}
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p class="text-sm font-bold text-emerald-800">Import complete and verified.</p>
          <ul class="mt-2 space-y-0.5 text-xs text-emerald-900">
            {#each Object.entries(importResult.counts) as [table, count] (table)}
              <li><span class="inline-block w-48">{table.replace(/_/g, ' ')}</span>{count}</li>
            {/each}
          </ul>
          {#if importResult.backupPath}
            <p class="mt-3 text-xs text-emerald-800">
              Previous database ({importResult.previousRows.toLocaleString()} transactions) saved to
              <code class="rounded bg-surface px-1 py-0.5">{importResult.backupPath}</code>
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

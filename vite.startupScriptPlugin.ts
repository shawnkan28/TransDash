import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

interface StartupScriptOptions {
  /**
   * Path to the script to run on startup. Can be absolute
   * (e.g. "C:/tools/run.ps1") or relative to the project root.
   * If omitted, the STARTUP_SCRIPT env var is used.
   * If neither is set, the plugin does nothing.
   *
   * The runner is chosen by file extension: ".ps1" -> PowerShell,
   * ".py" -> Python. Use the `command` option to override.
   */
  script?: string;
  /** Working directory for the script. Defaults to the script's own folder. */
  cwd?: string;
  /** Explicit interpreter/command override (e.g. "pwsh", "python3"). */
  command?: string;
  /** Extra arguments passed to the script. */
  args?: string[];
  /**
   * Environment variables to set for the script process. Merged on top of the
   * current process env, so the script (and anything it calls) can read them.
   */
  env?: Record<string, string>;
}

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a path relative to the project root into an absolute path.
 * Absolute inputs are returned unchanged. Useful for passing absolute
 * paths to the startup script's env while keeping the config relative.
 */
export function resolveFromRoot(relativePath: string): string {
  return path.resolve(PROJECT_ROOT, relativePath);
}

function buildInvocation(
  scriptPath: string,
  command: string | undefined,
  extraArgs: string[]
): { cmd: string; cmdArgs: string[] } {
  const ext = path.extname(scriptPath).toLowerCase();

  if (ext === '.ps1') {
    const cmd = command ?? process.env.POWERSHELL ?? 'powershell';
    return {
      cmd,
      cmdArgs: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        ...extraArgs,
      ],
    };
  }

  if (ext === '.py') {
    const cmd = command ?? process.env.PYTHON ?? 'python';
    return { cmd, cmdArgs: [scriptPath, ...extraArgs] };
  }

  // Fallback: run the file directly with an explicit command, or as-is.
  const cmd = command ?? scriptPath;
  const cmdArgs = command ? [scriptPath, ...extraArgs] : [...extraArgs];
  return { cmd, cmdArgs };
}

function resolveScriptPath(configured: string): string {
  const trimmed = configured.trim().replace(/^["']|["']$/g, '');
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(PROJECT_ROOT, trimmed);
}

export function startupScriptPlugin(options: StartupScriptOptions = {}): Plugin {
  const configured = options.script ?? process.env.STARTUP_SCRIPT ?? '';
  const scriptPath = configured ? resolveScriptPath(configured) : '';
  let runPromise: Promise<void> | null = null;

  function runOnce(): Promise<void> {
    if (runPromise) return runPromise;

    runPromise = new Promise<void>((resolve) => {
      if (!scriptPath) {
        console.log(
          '[startup-script] no script configured (set options.script or STARTUP_SCRIPT); skipping.'
        );
        resolve();
        return;
      }

      if (!fs.existsSync(scriptPath)) {
        console.warn(`[startup-script] script not found: ${scriptPath}; skipping.`);
        resolve();
        return;
      }

      const cwd = options.cwd
        ? path.resolve(PROJECT_ROOT, options.cwd)
        : path.dirname(scriptPath);

      const { cmd, cmdArgs } = buildInvocation(
        scriptPath,
        options.command,
        options.args ?? []
      );

      console.log(`[startup-script] running ${cmd} ${cmdArgs.join(' ')}`);

      const child = spawn(cmd, cmdArgs, {
        cwd,
        stdio: 'inherit',
        env: { ...process.env, ...options.env },
      });

      child.on('error', (error) => {
        console.error(
          `[startup-script] failed to start "${cmd}": ${error.message}. ` +
            'Ensure it is installed and on PATH. Continuing.'
        );
        resolve();
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('[startup-script] completed successfully');
        } else {
          console.error(`[startup-script] script exited with code ${code}. Continuing.`);
        }
        resolve();
      });
    });

    return runPromise;
  }

  return {
    name: 'startup-script',
    // Runs (and blocks) before a production build.
    async buildStart() {
      await runOnce();
    },
    // Runs (and blocks) before the dev server starts serving.
    async configureServer() {
      await runOnce();
    },
    // Runs (and blocks) before the preview server starts serving.
    async configurePreviewServer() {
      await runOnce();
    },
  };
}

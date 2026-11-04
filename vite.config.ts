import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { sqliteApiPlugin } from './vite.sqlitePlugin.ts'
import { noCacheHtmlPlugin } from './vite.noCacheHtmlPlugin.ts'
import { startupScriptPlugin, resolveFromRoot } from './vite.startupScriptPlugin.ts'

// Startup script paths per environment (.py → `python` via startupScriptPlugin).
// DEV  -> `npm run dev`
// PRD  -> `npm run preview` on host
// Docker -> set SKIP_STARTUP_SCRIPT=1; crawler runs in its own container instead.
const STARTUP_SCRIPTS = {
  dev: 'D:/Personal/Projects/StatementMgmt/start.py',
  prd: 'C:/Users/shawn/OneDrive/Apps/statementmgmt/start.py',
}

const skipStartupScript =
  process.env.SKIP_STARTUP_SCRIPT === '1' || process.env.SKIP_STARTUP_SCRIPT === 'true'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'
  const startupScript = skipStartupScript
    ? ''
    : (process.env.STARTUP_SCRIPT ??
      (isProd ? STARTUP_SCRIPTS.prd : STARTUP_SCRIPTS.dev))

  const plugins = [
    tailwindcss(),
    svelte(),
    noCacheHtmlPlugin(),
    sqliteApiPlugin(),
  ]

  if (startupScript) {
    plugins.push(
      startupScriptPlugin({
        script: startupScript,
        env: {
          // Stored relative here, passed to the script as an absolute path.
          TRANS_SAVE_PATH: resolveFromRoot('./data/transdash.sqlite'),
        },
      })
    )
  }

  return {
    plugins,
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      allowedHosts: ['shawn-rpi'],
      watch: {
        // Writing to the database should not trigger a full-page reload.
        ignored: ['**/data/**'],
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
      host: true,
    },
  }
})

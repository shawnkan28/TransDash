/**
 * Light/dark theme. The colours themselves live in app.css under
 * `:root[data-theme='dark']`; this only decides which one is active.
 *
 * The script in index.html applies the same rule before first paint, so the
 * page never flashes the wrong theme. Keep the storage key in sync with it.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'transdash-theme';

const systemQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return systemQuery?.matches ? 'dark' : 'light';
}

function apply(theme: Theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

class ThemeState {
  current = $state<Theme>(savedTheme() ?? systemTheme());

  constructor() {
    apply(this.current);
    // Until a choice is saved, follow the OS (e.g. a phone's scheduled dark mode).
    systemQuery?.addEventListener('change', () => {
      if (savedTheme()) return;
      this.current = systemTheme();
      apply(this.current);
    });
  }

  get isDark() {
    return this.current === 'dark';
  }

  toggle() {
    this.current = this.isDark ? 'light' : 'dark';
    apply(this.current);
    try {
      localStorage.setItem(STORAGE_KEY, this.current);
    } catch {
      // Private mode or blocked storage: the switch still works for this visit.
    }
  }
}

/** Reactive in components: `theme.isDark`, `theme.toggle()`. */
export const theme = new ThemeState();

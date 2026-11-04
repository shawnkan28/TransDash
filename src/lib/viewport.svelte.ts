/**
 * One definition of "mobile" for the whole app, replacing the `window.innerWidth
 * < 768` checks that were drifting apart in individual components.
 *
 * Matters beyond tidiness: it lets layout choose between the mobile and desktop
 * dashboards with `{#if}` rather than `md:hidden`, so the one that isn't shown
 * is never mounted. Under CSS-only hiding, a phone still built every chart on
 * the desktop dashboard and then painted none of them.
 */

/** Tailwind's `md` breakpoint — below this is the mobile layout. */
export const MOBILE_BREAKPOINT = 768;

const mediaQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    : null;

class ViewportState {
  isMobile = $state(mediaQuery?.matches ?? false);

  constructor() {
    mediaQuery?.addEventListener('change', (event) => {
      this.isMobile = event.matches;
    });
  }
}

/** Reactive in components: `viewport.isMobile` re-renders on rotate/resize. */
export const viewport = new ViewportState();

/** Plain read for code outside a component, such as the store's load path. */
export function isMobileViewport(): boolean {
  return mediaQuery?.matches ?? false;
}

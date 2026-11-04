interface FocusOptions {
  /** Also select the existing text, for fields where typing should replace it. */
  select?: boolean;
}

/**
 * Focuses an element as soon as it mounts.
 *
 * Retries once on the next frame: a mobile browser will quietly ignore
 * `focus()` on an element that is still animating into view, which leaves the
 * field looking ready but the keyboard closed.
 */
export function focusOnMount(
  node: HTMLElement & { select?: () => void },
  options: FocusOptions = {}
) {
  const apply = () => {
    // preventScroll keeps a sheet pinned above the keyboard from jumping.
    node.focus({ preventScroll: true });
    if (options.select && typeof node.select === 'function') node.select();
  };

  apply();
  const frame = requestAnimationFrame(() => {
    if (document.activeElement !== node) apply();
  });

  return {
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}

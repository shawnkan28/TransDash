/**
 * Prevents the page behind a full-screen sheet/modal from scrolling while
 * it's open. Reference-counted so nested sheets (e.g. an edit dialog opened
 * on top of a list sheet) don't unlock the body until all of them are closed.
 */
let lockCount = 0;
let previousOverflow = '';

function lock() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow;
  }
}

export function useBodyScrollLock(isOpen: () => boolean) {
  $effect(() => {
    if (!isOpen()) return;
    lock();
    return () => unlock();
  });
}

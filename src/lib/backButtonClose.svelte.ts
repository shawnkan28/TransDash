/**
 * Makes the phone's back button close an open sheet/modal instead of
 * leaving the app: pushes a throwaway history entry while open, and
 * consumes it again however the sheet closes.
 *
 * `popstate` is a window-level event, so every mounted hook hears every
 * back navigation. A shared stack keeps that from closing the wrong thing:
 * only the most recently opened sheet reacts to a real back press, and a
 * sheet closing itself (tap an option, Cancel, Save) rewinds its own entry
 * without waking any of the sheets beneath it.
 */
interface StackEntry {
  close: () => void;
}

const stack: StackEntry[] = [];
let pendingProgrammaticPops = 0;

function handlePopState() {
  // A history.back() we issued ourselves after an in-app close — the sheet
  // is already gone, so nothing below it should react.
  if (pendingProgrammaticPops > 0) {
    pendingProgrammaticPops--;
    return;
  }

  stack.pop()?.close();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', handlePopState);
}

export function useBackButtonClose(isOpen: () => boolean, requestClose: () => void) {
  let pushed = false;

  const entry: StackEntry = {
    close() {
      // Our history entry is already gone — just close the UI.
      pushed = false;
      requestClose();
    },
  };

  function rewind() {
    pushed = false;
    const index = stack.lastIndexOf(entry);
    if (index !== -1) stack.splice(index, 1);
    pendingProgrammaticPops++;
    history.back();
  }

  $effect(() => {
    const open = isOpen();
    if (open && !pushed) {
      history.pushState({ sheetOpen: true }, '');
      stack.push(entry);
      pushed = true;
    } else if (!open && pushed) {
      rewind();
    }
  });

  $effect(() => {
    return () => {
      if (pushed) rewind();
    };
  });
}

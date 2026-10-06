import { isElementVisible } from './dom';

// Covered containers own inert in their templates. This view only owns its
// initial focus and opener; playback and native dialogs keep their own focus.
export function artworkFocusScope(node: HTMLElement) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let disposed = false;
  const restore = restoreFocusOnClose(node, previous);
  queueMicrotask(() => {
    if (disposed || node.closest('[inert]')) return;
    const active = document.activeElement;
    if (active instanceof Element && active.closest('dialog[open]')) return;
    if (active !== previous && active !== document.body) return;
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  });
  return () => {
    disposed = true;
    restore();
  };
}

export function restoreFocusOnClose(node: HTMLElement, previous: HTMLElement | null) {
  return () => {
    const active = document.activeElement;
    if (active !== document.body && !node.contains(active)) return;
    // Wait for the owner's template to remove inert from the covered view.
    queueMicrotask(() => {
      if (document.activeElement !== document.body && !node.contains(document.activeElement)) return;
      if (previous?.isConnected && !previous.closest('[inert]') && isElementVisible(previous)) {
        previous.focus({ preventScroll: true });
      }
    });
  };
}

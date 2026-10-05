import { isElementVisible } from './dom';

const backgrounds = '.browse, .scroll, .empty-library, .results';
const controls = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]';
const scopes: HTMLElement[] = [];
const inertOwners = new Map<HTMLElement, boolean>();
let listeners: AbortController | undefined;
let observer: MutationObserver | undefined;

function syncBackgrounds() {
  const active = scopes.at(-1);
  const covered = new Set<HTMLElement>(active ? [...document.querySelectorAll<HTMLElement>(backgrounds), ...scopes.filter(scope => scope !== active)] : []);
  for (const [element, previous] of inertOwners) {
    if (!covered.has(element)) {
      element.inert = previous;
      inertOwners.delete(element);
    }
  }
  for (const element of covered) {
    if (!inertOwners.has(element)) inertOwners.set(element, element.inert);
    element.inert = true;
  }
}

function focusable(element: HTMLElement) {
  return element.tabIndex >= 0 && !element.closest('[inert]') && isElementVisible(element);
}

function allowedRoots() {
  const active = scopes.at(-1);
  if (!active || document.querySelector('dialog[open]')) return [];
  // Shortcuts sit above the artwork view. Native dialogs own their own focus trap.
  const help = document.querySelector<HTMLElement>('.hint');
  if (help && isElementVisible(help)) return [help];
  return [active, ...document.querySelectorAll<HTMLElement>('.bar, #playback-options.open, .playback-status, .preference-notice')];
}

function availableControls(roots: HTMLElement[]) {
  return [...document.querySelectorAll<HTMLElement>(controls)]
    .filter(element => roots.some(root => root.contains(element)) && focusable(element));
}

function containTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const roots = allowedRoots();
  if (!roots.length) return;
  const items = availableControls(roots);
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (!items.length) return;
  if (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
    event.preventDefault();
    (event.shiftKey ? items.at(-1) : items[0])?.focus({ preventScroll: true });
  }
}

function containFocus(event: FocusEvent) {
  const roots = allowedRoots();
  if (!roots.length || roots.some(root => root.contains(event.target as Node))) return;
  availableControls(roots)[0]?.focus({ preventScroll: true });
}

// A single owner isolates the library and restores the opener for every artwork view.
// Playback controls stay available, so this region is deliberately not aria-modal.
export function artworkFocusScope(node: HTMLElement) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  scopes.push(node);
  syncBackgrounds();
  if (!listeners) {
    listeners = new AbortController();
    document.addEventListener('keydown', containTab, { signal: listeners.signal });
    document.addEventListener('focusin', containFocus, { signal: listeners.signal });
    observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(added => added instanceof HTMLElement && (added.matches(backgrounds) || added.querySelector(backgrounds))))) syncBackgrounds();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  queueMicrotask(() => {
    if (scopes.at(-1) !== node || document.querySelector('dialog[open]')) return;
    [...node.querySelectorAll<HTMLElement>(controls)].find(focusable)?.focus({ preventScroll: true });
  });
  return () => {
    const active = document.activeElement;
    const restore = active === document.body || node.contains(active);
    const index = scopes.indexOf(node);
    if (index >= 0) scopes.splice(index, 1);
    syncBackgrounds();
    if (!scopes.length) {
      listeners?.abort();
      listeners = undefined;
      observer?.disconnect();
      observer = undefined;
    }
    if (restore) queueMicrotask(() => {
      if (document.querySelector('dialog[open]') || (document.activeElement !== document.body && !node.contains(document.activeElement))) return;
      const target = previous?.isConnected && !previous.closest('[inert]') ? previous : document.querySelector<HTMLElement>('.bar-toggle');
      if (target && isElementVisible(target)) target.focus({ preventScroll: true });
    });
  };
}

export function isElementVisible(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === 'function') return element.checkVisibility();
  if (!element.getClientRects().length || element.closest('[hidden]')) return false;
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector('summary')?.contains(element)) return false;
  }
  return true;
}

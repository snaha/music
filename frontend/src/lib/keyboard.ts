// Delegate keys from a region's controls without adding a fake interactive role.
export function keyboardScope(node: HTMLElement, handle: (event: KeyboardEvent) => void) {
  const listener = (event: KeyboardEvent) => handle(event);
  node.addEventListener('keydown', listener);
  return { destroy() { node.removeEventListener('keydown', listener); } };
}

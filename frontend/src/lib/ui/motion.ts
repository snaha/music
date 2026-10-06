import { MediaQuery } from 'svelte/reactivity';
import { fly } from 'svelte/transition';

const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
const settle = (t: number) => 1 - Math.pow(1 - t, 4);

// Short travel preserves the relationship to the trigger without delaying input.
export function reveal(node: Element, { x = 0, y = 0, duration = 220 } = {}) {
  return fly(node, {
    x: reducedMotion.current ? 0 : x,
    y: reducedMotion.current ? 0 : y,
    duration: reducedMotion.current ? Math.min(duration, 80) : duration,
    easing: settle,
  });
}

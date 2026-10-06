import { untrack } from 'svelte';
import { orderedBrowseCollections, reconcileBrowseOrder, selectBrowseCollections, type BrowseInput, type BrowseOrder } from './browse-view';

export function createBrowseView(readInput: () => BrowseInput) {
  const input = $derived.by(readInput);
  const ranked = $derived(selectBrowseCollections(input));
  let order = $state.raw<BrowseOrder>({ key: '', ids: [] });
  // Commit ordering history outside derivation; selectors remain deterministic.
  $effect(() => { const next = reconcileBrowseOrder(untrack(() => order), input.key, ranked); order = next; });
  const collections = $derived(orderedBrowseCollections(ranked, reconcileBrowseOrder(order, input.key, ranked)));
  return { get collections() { return collections; } };
}

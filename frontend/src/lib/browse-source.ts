import type { Collection } from './music';

let source: (() => Collection[]) | undefined;
export function registerBrowseSource(read: () => Collection[]): () => void {
  source = read;
  return () => { if (source === read) source = undefined; };
}
export function browseCollections(fallback: Collection[] = []): Collection[] {
  return source ? source() : fallback;
}

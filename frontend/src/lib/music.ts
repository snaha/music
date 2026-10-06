export type { Source, Track, Collection } from '../../../shared/music';
export const localId = (kind: string, id: string) => `local:${kind}:${id}`;

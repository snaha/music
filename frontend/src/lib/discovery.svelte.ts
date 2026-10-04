import { readJsonPreference, writePreference } from './preferences';
import { untrack } from 'svelte';
import { session } from './api.svelte';
import { listeningHistory, loadHistory, historyStats } from './listening-history.svelte';
import { artworkHue } from './artwork-palette';
import type { Collection } from './music';

export type Traits = { mood: number; energy: number; acoustic: number; vocal: number };
export type AlbumMetadata = { favorite?: boolean; genres?: string[]; year?: number; traits?: Traits; hue?: number; colorRevision?: string; colorReady?: boolean };
export const catalog = $state({ items: {} as Record<string, AlbumMetadata>, colors: {} as Record<string, Pick<AlbumMetadata, 'hue' | 'colorRevision' | 'colorReady'>>, stats: {} as Record<string, { plays: number; lastPlayed: number }>, error: '', colorsLoading: false });
export const dig = $state({ open: false, moodOn: false, mood: 50, energy: 50, familiarity: 50, acoustic: 50, vocal: 50, preset: '' });
export const digActive = () => dig.moodOn || dig.familiarity !== 50 || dig.acoustic !== 50 || dig.vocal !== 50;
export const presets = [
  ['Rainy afternoon', 30, 25, 65, 50], ['Focus time', 50, 25, 50, 15], ['Chill like a chinchilla', 65, 20, 60, 50],
  ['Aperitivo with friends', 70, 45, 60, 70], ['Dance baby dance', 85, 85, 15, 65], ['Late night', 35, 30, 30, 40],
  ['Morning bird', 75, 55, 65, 65], ['Cooking at home', 70, 45, 65, 75], ['Dreaming space', 50, 20, 15, 15], ['Road trip', 75, 75, 35, 75]
] as const;
export function resetDig() { Object.assign(dig, { moodOn: false, mood: 50, energy: 50, familiarity: 50, acoustic: 50, vocal: 50, preset: '' }); }
export function choosePreset(preset: typeof presets[number]) {
  Object.assign(dig, { preset: preset[0], moodOn: true, mood: preset[1], energy: preset[2], acoustic: preset[3], vocal: preset[4] });
}
let storageKey = '', saveTimer: ReturnType<typeof setTimeout> | undefined, statsRevision = 0;
const accountKey = () => `music.catalog.v1:${window.desktop ? 'desktop' : session.base}:${session.username}`;
function clean(value: unknown): AlbumMetadata {
  if (!value || typeof value !== 'object') return {};
  const item = value as AlbumMetadata;
  const traits = item.traits && ['mood', 'energy', 'acoustic', 'vocal'].every(key => Number.isFinite(item.traits![key as keyof Traits]) && item.traits![key as keyof Traits] >= 0 && item.traits![key as keyof Traits] <= 100) ? item.traits : undefined;
  return { favorite: typeof item.favorite === 'boolean' ? item.favorite : undefined,
    genres: Array.isArray(item.genres) ? item.genres.filter(genre => typeof genre === 'string').slice(0, 20) : undefined,
    year: Number.isInteger(item.year) && item.year! > 0 && item.year! <= 9999 ? item.year : undefined, traits,
    hue: Number.isFinite(item.hue) ? item.hue : undefined, colorRevision: typeof item.colorRevision === 'string' ? item.colorRevision : undefined, colorReady: item.colorReady === true };
}
export function loadCatalog() {
  const key = accountKey();
  if (storageKey === key) return;
  if (storageKey) flush();
  clearTimeout(saveTimer); colorQueue.clear();
  storageKey = key; catalog.stats = {}; catalog.error = ''; resetDig();
  try { const data = readJsonPreference(key, {}); catalog.items = Object.fromEntries(Object.entries(data).map(([id, value]) => [id, clean(value)])); }
  catch { catalog.items = {}; }
  try { catalog.colors = Object.fromEntries(Object.entries(readJsonPreference(`${key}:colors`, {})).map(([id, value]) => [id, clean(value)])); } catch { catalog.colors = {}; }
  loadHistory();
}
export function saveMetadata(id: string, patch: AlbumMetadata) {
  catalog.items[id] = clean({ ...catalog.items[id], ...patch });
  persist();
}
function flush() {
  if (!storageKey) return;
  const items = writePreference(storageKey, JSON.stringify(catalog.items));
  const colors = writePreference(`${storageKey}:colors`, JSON.stringify(catalog.colors));
  // The preferences service owns retryable persistence errors.
  if (items && colors) catalog.error = '';
}
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 200); }
export function metadata(tile: Collection) {
  const item = catalog.items[tile.id];
  return { favorite: item?.favorite ?? tile.favorite ?? false, genres: item?.genres ?? tile.genres ?? [], year: item?.year ?? tile.year, traits: item?.traits };
}
export function digScore(tile: Collection) {
  if (!digActive()) return 1;
  const traits = catalog.items[tile.id]?.traits;
  const distances: number[] = [];
  if (dig.moodOn) { if (!traits) return 0; distances.push(Math.abs(traits.mood - dig.mood), Math.abs(traits.energy - dig.energy)); }
  for (const key of ['acoustic', 'vocal'] as const) if (dig[key] !== 50) { if (!traits) return 0; distances.push(Math.abs(traits[key] - dig[key])); }
  if (dig.familiarity !== 50) {
    const plays = catalog.stats[tile.id]?.plays || 0;
    const familiarity = Math.min(100, Math.log2(plays + 1) * 20);
    distances.push(Math.abs(familiarity - (100 - dig.familiarity)));
  }
  return distances.length && Math.max(...distances) <= 45 ? 1 - distances.reduce((a, b) => a + b, 0) / distances.length / 100 : 0;
}
export function coverRevision(tile: Collection) {
  // Persist a fingerprint, never a signed local artwork URL.
  let hash = 2166136261;
  for (const char of tile.cover) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
const colorQueue = new Map<string, Collection>();
let colorRunning = false, colorLifetime = 0;
export function warmColors(tiles: Collection[]) {
  for (const tile of tiles) if (tile.cover && (!catalog.colors[tile.id]?.colorReady || catalog.colors[tile.id]?.colorRevision !== coverRevision(tile))) colorQueue.set(tile.id, tile);
  if (!colorRunning) void consumeColors();
}
async function consumeColors() {
  colorRunning = true; catalog.colorsLoading = true;
  while (colorQueue.size) {
    const batch = [...colorQueue.values()].slice(0, 3);
    for (const tile of batch) colorQueue.delete(tile.id);
    const key = storageKey, lifetime = colorLifetime;
    await Promise.all(batch.map(async tile => {
      const hue = await artworkHue(tile.cover);
      if (lifetime === colorLifetime && storageKey === key && (!colorQueue.has(tile.id) || coverRevision(colorQueue.get(tile.id)!) === coverRevision(tile))) { catalog.colors[tile.id] = { hue, colorRevision: coverRevision(tile), colorReady: true }; persist(); }
    }));
    await new Promise(resolve => setTimeout(resolve, 32));
  }
  colorRunning = false; catalog.colorsLoading = false;
}
export function startDiscovery() {
 const destroy = $effect.root(() => {
  $effect(() => { if (!session.api) return; session.username; session.base; untrack(loadCatalog); });
  $effect(() => {
    if (!session.api) return;
    listeningHistory.total; listeningHistory.persistedRevision; session.username; session.base;
    const revision = ++statsRevision;
    const timer = setTimeout(async () => {
      try { const stats = await historyStats(); if (stats && revision === statsRevision) catalog.stats = stats; }
      catch { /* Keep the last successful durable counts until a write completes or retries. */ }
    }, 250);
    return () => clearTimeout(timer);
  });
});
 return () => { destroy(); statsRevision++; colorLifetime++; clearTimeout(saveTimer); colorQueue.clear(); flush(); };
}

import { readPreference, readJsonPreference, writePreference } from './preferences';
import { blobFromText, deleteCustom, loadCustom, saveCustom } from './background';

export const MATERIALS = { vinyl: 'Vinyl', grille: 'Grille', fabric: 'Fabric', noise: 'Noise', custom: 'Custom', viz: 'Viz' } as const; // viz: the visualizer plays behind the grid
export type Material = keyof typeof MATERIALS;

// how the grid's background looks; every option is saved as it changes (device only, like the other settings)
const raw = readJsonPreference<Record<string, unknown> | null>('bg', {});
const saved = raw && typeof raw === 'object' ? raw : {};
const material = String(saved.material ?? readPreference('material', 'noise'));
export const bg = $state({
  material: (material in MATERIALS ? material : 'noise') as Material,
  scroll: typeof saved.scroll === 'boolean' ? saved.scroll : true, // the background moves with the cards, or stays put behind them
  tile: typeof saved.tile === 'boolean' ? saved.tile : true, // custom image repeats at its own size, or is stretched to fill the screen
  custom: '', // object URL of the imported image, '' when there is none
});
export function startBackground() {
  let active = true;
  const destroy = $effect.root(() => { $effect(() => { writePreference('bg', JSON.stringify({ material: bg.material, scroll: bg.scroll, tile: bg.tile })); }); });
  void loadCustom().then(b => { if (active && b) show(b); }).catch(() => {});
  return () => { active = false; destroy(); if (bg.custom) URL.revokeObjectURL(bg.custom); bg.custom = ''; };
}

const IMAGE = /^image\/(svg\+xml|png|jpeg|webp|gif|avif)$/;
function show(b: Blob) { if (bg.custom) URL.revokeObjectURL(bg.custom); bg.custom = URL.createObjectURL(b); }


// a picked or dropped file, or pasted SVG / CSS from a generator; false when it is not an image
export async function importBackground(src: Blob | string): Promise<boolean> {
  const b = typeof src === 'string' ? await blobFromText(src) : src;
  if (!b || !IMAGE.test(b.type)) return false;
  await saveCustom(b); show(b); bg.material = 'custom';
  return true;
}
// 20 sample backgrounds from fffuel.co's generators (free for any use, no attribution needed), bundled in
// public/backgrounds. A random pick never repeats the previous one, across restarts too
const SAMPLES = ['bbblurry', 'ccchaos', 'cccoil', 'ffflurry', 'ffflux', 'gggyrate', 'hhhorizon', 'llleaves', 'nnnoise', 'ooorganize',
  'oooscillate', 'rrrepeat', 'rrreplicate', 'ssspiral', 'sssquiggly', 'ttten', 'tttwinkle', 'uuundulate', 'vvvortex', 'wwwhirl'];
export function nextSample(last: number, n = SAMPLES.length, rnd = Math.random) {
  let i = Math.floor(rnd() * (last < 0 ? n : n - 1));
  if (last >= 0 && i >= last) i++;
  return i;
}
export async function randomBackground() {
  const i = nextSample(Number(readPreference('bg.sample', '-1')));
  writePreference('bg.sample', String(i));
  return importBackground(await (await fetch(`${import.meta.env.BASE_URL}backgrounds/${SAMPLES[i]}.svg`)).blob());
}
export async function clearBackground() {
  await deleteCustom();
  if (bg.custom) URL.revokeObjectURL(bg.custom);
  bg.custom = '';
  if (bg.material === 'custom') bg.material = 'vinyl';
}

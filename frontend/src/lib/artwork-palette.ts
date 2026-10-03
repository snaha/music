// A small, cached artwork sample. Playback never waits for color extraction.
export const fallbackPalette = '--play-surface:#20232a;--play-bar:#15171c;--play-text:#f5f5f7;--play-muted:#c3c5cd;--play-accent:#d7deef;--play-line:#ffffff24;';
const cache = new Map<string, Promise<string>>();
export async function artworkHue(src: string): Promise<number | undefined> {
  try {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 12;
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return;
    context.drawImage(image, 0, 0, 12, 12);
    const pixels = context.getImageData(0, 0, 12, 12).data;
    let x = 0, y = 0, weight = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]].map(c => c / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      if (delta < .08 || max < .1) continue;
      const hue = (max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * Math.PI / 3;
      x += Math.cos(hue) * delta; y += Math.sin(hue) * delta; weight += delta;
    }
    return weight ? (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 : 360;
  } catch { return; }
}
const mix = (color: number[], target: number, amount: number) => color.map(channel => Math.round(channel * (1 - amount) + target * amount));
const rgb = (color: number[]) => `rgb(${color.join(' ')})`;
const luminance = (color: number[]) => color.map(channel => { const c = channel / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
export function paletteFromPixels(pixels: Uint8ClampedArray): string {
  const bins = new Map<string, { count: number; sum: number[] }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const color = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = color.map(c => Math.floor(c / 32)).join(':');
    const bin = bins.get(key) ?? { count: 0, sum: [0, 0, 0] };
    bin.count++; color.forEach((c, j) => bin.sum[j] += c); bins.set(key, bin);
  }
  const ranked = [...bins.values()].sort((a, b) => b.count - a.count);
  if (!ranked.length) return fallbackPalette;
  // Favor a substantial colored region over a cover's black border or white lettering.
  const colored = ranked.find(bin => bin.count >= ranked[0].count * .2 && Math.max(...bin.sum) - Math.min(...bin.sum) > bin.count * 25);
  const dominant = colored ?? ranked[0];
  const color = dominant.sum.map(c => c / dominant.count);
  const light = luminance(color) > .45;
  const surface = light ? mix(color, 255, .65) : mix(color, 0, .55);
  const bar = light ? mix(color, 255, .4) : mix(color, 0, .75);
  // The tint ranges guarantee readable foregrounds, including saturated yellow/green covers.
  const text = light ? '#17202a' : '#ffffff';
  const muted = light ? '#394653' : '#e1e5eb';
  const accent = light ? '#17202a' : rgb(mix(color, 255, .75));
  return `--play-surface:${rgb(surface)};--play-bar:${rgb(bar)};--play-text:${text};--play-muted:${muted};--play-accent:${accent};--play-line:${light ? '#17202a30' : '#ffffff30'};`;
}
export function artworkPalette(src: string): Promise<string> {
  if (!src) return Promise.resolve(fallbackPalette);
  const existing = cache.get(src); if (existing) return existing;
  const result = (async () => {
    try {
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return fallbackPalette;
      context.drawImage(image, 0, 0, 24, 24);
      return paletteFromPixels(context.getImageData(0, 0, 24, 24).data);
    } catch { return fallbackPalette; }
  })();
  if (cache.size >= 48) cache.delete(cache.keys().next().value!);
  cache.set(src, result); return result;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletteFromPixels, fallbackPalette } from '../src/lib/artwork-palette.ts';

const luminance = (color: string) => {
  const rgb = color.startsWith('#') ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : color.match(/\d+/g)!.map(Number);
  return rgb.map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
    .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
};
test('cover palettes keep text and playback controls readable across the RGB range', () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const palette = Object.fromEntries(paletteFromPixels(new Uint8ClampedArray([r, g, b, 255])).split(';').filter(Boolean).map(value => value.split(':')));
    for (const foreground of ['--play-text', '--play-muted', '--play-accent']) for (const background of ['--play-surface', '--play-bar']) {
      const a = luminance(palette[foreground]), z = luminance(palette[background]);
      assert.ok((Math.max(a, z) + .05) / (Math.min(a, z) + .05) >= 4.5, `Unreadable ${foreground} on ${background} for ${r},${g},${b}`);
    }
  }
});
test('empty and transparent artwork use the neutral fallback', () => {
  assert.equal(paletteFromPixels(new Uint8ClampedArray()), fallbackPalette);
  assert.equal(paletteFromPixels(new Uint8ClampedArray([255, 0, 0, 0])), fallbackPalette);
});

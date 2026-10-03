import { describe, expect, it } from 'vitest';
import { fold, matches } from './search';

describe('fold', () => {
  it('lowercases and strips accents', () => {
    expect(fold('Old Skoöl of Rock')).toBe('old skool of rock');
    expect(fold('Motörhead')).toBe('motorhead');
    expect(fold('Queensrÿche')).toBe('queensryche');
  });
  it('turns every kind of dash into a space', () => {
    expect(fold('Buddha-Bar')).toBe('buddha bar'); // hyphen-minus
    expect(fold('Buddha‐Bar')).toBe('buddha bar'); // U+2010 hyphen, as MusicBrainz writes it
    expect(fold('Buddha–Bar')).toBe('buddha bar'); // en dash
    expect(fold('Buddha—Bar')).toBe('buddha bar'); // em dash
  });
});

describe('matches', () => {
  it('finds dashed titles by their words, with or without the dash', () => {
    expect(matches('Buddha‐Bar V David Visan', 'buddha bar')).toBe(true);
    expect(matches('Buddha‐Bar V David Visan', 'buddha-bar')).toBe(true);
    expect(matches('Buddha Bar II Claude Challe', 'buddha-bar')).toBe(true);
  });
  it('finds accented titles by their plain spelling', () => {
    expect(matches('Old Skoöl of Rock Various Artists', 'skool')).toBe(true);
    expect(matches('Old Skoöl of Rock Various Artists', 'old')).toBe(true);
  });
  it('matches everything on an empty or blank query', () => {
    expect(matches('anything', '')).toBe(true);
    expect(matches('anything', '   ')).toBe(true);
  });
  it('still rejects what is not there', () => {
    expect(matches('Old Skoöl of Rock Various Artists', 'skull')).toBe(false);
  });
});

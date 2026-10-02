// the grid's type-ahead match: accents are folded on both sides, so "skool" finds "Skoöl" and "motorhead" finds
// "Motörhead"; any dash counts as a space, so "buddha bar" finds "Buddha‐Bar" and "buddha-bar" finds "Buddha Bar"
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\p{Pd}/gu, ' ').toLowerCase();

// an empty query matches everything
export const matches = (text: string, query: string) => { const q = fold(query.trim()); return !q || fold(text).includes(q); };

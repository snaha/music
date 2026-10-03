export const COMPONENT_STYLES = { classic: 'Classic', studio: 'Studio', neon: 'Neon', coss: 'Coss' } as const;
export type ComponentStyle = keyof typeof COMPONENT_STYLES;
const saved = localStorage.getItem('ui.components');
export const ui = $state({ components: (saved && saved in COMPONENT_STYLES ? saved : 'studio') as ComponentStyle });
$effect.root(() => { $effect(() => {
  localStorage.setItem('ui.components', ui.components);
  document.documentElement.dataset.components = ui.components;
}); });

// Transient toolbar mode; theme preference alone is persisted.
export const toolbar = $state({ selecting: false, mode: 'library' as 'library' | 'filters' | 'layout' | 'look' | 'theme' });

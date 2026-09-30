<script lang="ts">
  let { name }: { name: 'display' | 'settings' | 'star' | 'reset' | 'info' | 'filter' | 'shuffle' } = $props();
  const paths = { filter: 'M4 7h16M4 17h16M8 4v6M16 14v6', shuffle: 'm18 3 3 3-3 3M3 18 15 6h6M3 6h3l3 3m6 6 3 3h3m-3-3 3 3-3 3', display: 'M4 4h16v5H4zM4 13h6v7H4zM14 13h6v7h-6z', star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z', reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6', info: 'M12 11v6M12 7h.01' };
</script>
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'settings'}<circle cx="12" cy="12" r="3" /><path d="M9 3h6l.7 3 2.1 1.2 3-.8 3 5.2-2.3 2.1v2.4l2.3 2.1-3 5.2-3-.8-2.1 1.2-.7 3H9l-.7-3-2.1-1.2-3 .8-3-5.2 2.3-2.1v-2.4L.2 11.6l3-5.2 3 .8L8.3 6Z" transform="translate(2.4 0) scale(.8)" />{:else}<path d={paths[name]} />{/if}
  {#if name === 'info'}<circle cx="12" cy="12" r="9" />{/if}
</svg>

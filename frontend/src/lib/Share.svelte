<script lang="ts">
  import QRCode from 'qrcode';
  import Drawer from './Drawer.svelte';
  import { shareLink } from './sharing.svelte';

  let { onclose, from = 'bottom' }: { onclose: () => void; from?: 'bottom' | 'right' } = $props();
  let qr = $state(''), error = $state('');
  shareLink()
    .then(async (l) => { qr = await QRCode.toDataURL(l, { width: 640, margin: 1, color: { dark: '#eeeeee', light: '#141414' } }); })
    .catch((e) => (error = (e as Error).message));
</script>

<Drawer {from} {onclose}>
  <div class="body" class:right={from === 'right'}>
    {#if qr}
      <img class="qr" src={qr} alt="QR code to open this library" />
      <p class="lead">scan with a phone on the same network</p>
      <p class="note">the code includes the share account, keep it to people you trust</p>
    {:else if error}
      <p class="note">{error}</p>
    {/if}
  </div>
</Drawer>

<style>
  .body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(16 * var(--s)); padding: calc(24 * var(--s)); }
  /* the app's white on dark: text tone squares on the background's darkest tone, framed like the panels. Phone cameras
     read inverted codes; some older scanner apps don't. The quiet zone is one module instead of the spec's four:
     blurred, shrunk test renders decoded as well as with three */
  .qr { width: min(60vh, 80vw); border-radius: 6px; border: 1px solid #fff2; box-shadow: 0 8px 40px #000; }
  /* right variant: the code fills whatever space is left */
  .body.right { min-height: 0; min-width: 0; }
  .body.right .qr { flex: 1 1 0; min-height: 0; width: auto; max-width: 100%; height: auto; object-fit: contain; }
  .lead { margin: calc(8 * var(--s)) 0 0; font-size: calc(32 * var(--s)); opacity: .9; letter-spacing: .03em; text-align: center; }
  .note { margin: 0; font-size: calc(18 * var(--s)); opacity: .5; text-align: center; max-width: 60ch; }
</style>

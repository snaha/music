<script lang="ts">
  let { notes, compact = false }: { notes: BuildNotes; compact?: boolean } = $props();
</script>

<section class="build-highlights" aria-label="What's in this build">
  <h2>{notes.title}</h2>
  <p>{notes.summary}</p>
  {#if !compact}
    <ul>{#each notes.highlights as highlight}<li>{highlight}</li>{/each}</ul>
  {/if}
  <p class="try-it"><strong>Try it:</strong> {notes.tryIt}</p>
</section>

<style>
  .build-highlights { border-top: 1px solid var(--ui-border); padding-top: 20px; overflow-wrap: anywhere; }
  h2 { margin: 0 0 8px; font-size: 16px; line-height: 1.4; font-weight: 600; letter-spacing: -.015em; }
  p, ul { max-width: 65ch; margin: 0; font-size: 13px; line-height: 1.6; color: var(--ui-text-muted); }
  ul { padding-left: 20px; margin-top: 12px; }
  li + li { margin-top: 4px; }
  .try-it { margin-top: 12px; }
  strong { font-weight: 550; color: var(--ui-text); }
</style>

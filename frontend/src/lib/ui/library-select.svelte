<script lang="ts">
  import { Combobox } from 'bits-ui';
  let { value = $bindable(''), options, label, onchange }: {
    value?: string; options: { value: string; label: string }[]; label: string; onchange?: () => void;
  } = $props();
  let open = $state(false), query = $state('');
  const items = $derived(options.map(item => ({ ...item, value: item.value || '__all__' })));
  const selected = $derived(value || '__all__');
  const selectedLabel = $derived(options.find(item => item.value === value)?.label ?? label);
  const matches = $derived(items.filter(item => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  let limit = $state(60);
  let inputValue = $state('');
  $effect(() => { inputValue = open ? query : selectedLabel; });
</script>
<Combobox.Root type="single" value={selected} {items} bind:open {inputValue}
  onOpenChange={() => { query = ''; limit = 60; }} onValueChange={(next) => { value = next === '__all__' ? '' : next; onchange?.(); }}>
  <div class="library-select-field">
    <Combobox.Input aria-label={label} placeholder={selectedLabel} oninput={(event) => { const text = event.currentTarget.value; open = true; query = text; limit = 60; }} />
    <Combobox.Trigger aria-label="Open {label}">⌄</Combobox.Trigger>
  </div>
  <Combobox.Portal>
    <Combobox.Content class="library-select-menu" sideOffset={6} align="start">
      <Combobox.Viewport>
        {#each matches.slice(0, limit) as item (item.value)}
          <Combobox.Item value={item.value} label={item.label} class="library-select-item"><span>{item.label}</span><span aria-hidden="true">{selected === item.value ? '✓' : ''}</span></Combobox.Item>
        {/each}
        {#if !matches.length}<p class="library-select-note">No matches</p>{/if}
        {#if matches.length > limit}<button class="library-select-more" onpointerdown={(event) => event.preventDefault()} onclick={() => (limit += 60)}>Show more · {matches.length - limit} remaining</button>{/if}
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>

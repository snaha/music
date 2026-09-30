# UI components

Button and Slider are adapted from the MIT-licensed shadcn-svelte registry:
https://github.com/huntabyte/shadcn-svelte/tree/main/docs/src/lib/registry/ui

Slider uses Bits UI for keyboard, pointer, touch and ARIA behavior. Button retains
shadcn's variant API. Styles live in src/components.css, avoiding a global Tailwind
reset on the existing cover wall.

Display menu → Components switches persisted device-local Classic, Studio and Neon styles.
These are styles of the same components, not separately installed UI libraries.
The default is Studio; switching changes presentation only.

Candidates researched:
- shadcn-svelte: customizable source-owned components; chosen foundation.
- Bits UI: accessible headless Svelte primitives; used for Slider.
- Skeleton: complete Tailwind design system; candidate for a broader redesign.

https://www.shadcn-svelte.com/docs/components/button
https://www.bits-ui.com/
https://www.skeleton.dev/

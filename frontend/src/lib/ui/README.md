# UI components

Button and Slider are adapted from the MIT-licensed shadcn-svelte registry:
https://github.com/huntabyte/shadcn-svelte/tree/main/docs/src/lib/registry/ui

Slider uses Bits UI for keyboard, pointer, touch and ARIA behavior. Button retains
shadcn's variant API. Styles live in src/components.css, avoiding a global Tailwind
reset on the existing cover wall.

Toolbar → Theme switches persisted device-local Classic, Studio, Neon and Coss themes. Library, Filters, Layout, Background and Theme share one toolbar surface. Settings opens a centered native dialog with Appearance and Advanced tabs; Escape, the close button or the backdrop dismisses it.
Opening the top-right selector replaces the active controls in one row. Choosing a mode restores its controls; Back returns to the selector. The selector and non-library modes pin the toolbar. Narrow screens scroll choices and controls horizontally.
These are styles of the same components, not separately installed UI libraries.
The default is Studio; switching changes presentation only.

Candidates researched:
- shadcn-svelte: customizable source-owned components; chosen foundation.
- Bits UI: accessible headless Svelte primitives; used for Slider.
- Skeleton: complete Tailwind design system; candidate for a broader redesign.

https://www.shadcn-svelte.com/docs/components/button
https://www.bits-ui.com/
https://www.skeleton.dev/

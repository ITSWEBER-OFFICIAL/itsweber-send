# @itsweber-send/theme

Design tokens and theme presets for ITSWEBER Send. Three-layer architecture:

```
tokens.json (primitive)        ──►  presets/*.json (semantic)        ──►  styles/semantic.css (component)
"#3ba7a7"                          "color.brand": "{color.brand.teal-500}"   --brand: #3ba7a7
```

## Layers

### 1. Primitives — `tokens.json`

Raw design values: hex colors, sizes in px/rem, shadow strings. Should change rarely.

### 2. Semantic — `presets/itsweber-light.json`, `presets/itsweber-dark.json`

Semantic roles (`background`, `surface`, `brand`, `muted`, …) mapped to primitives. The `{color.brand.teal-500}` notation is a reference into `tokens.json`.

### 3. Component — `styles/semantic.css`

The runtime CSS file the app imports. Defines the same semantic roles as CSS custom properties, switched via the `data-theme` attribute (`light` / `dark` / `system`).

## Usage

```ts
// In apps/web/src/app.css
@import '@itsweber-send/theme/styles/semantic.css';
```

```svelte
<!-- In a component -->
<div style="background: var(--surface); color: var(--text)">…</div>
```

```html
<!-- In app.html -->
<html data-theme="system" lang="de">
```

## Adding a token

1. Add the raw value to `tokens.json`.
2. Reference it in both `presets/itsweber-light.json` and `presets/itsweber-dark.json` if it has a semantic meaning that differs between themes.
3. Add the corresponding `--variable` to `styles/semantic.css` for both `:root`/`[data-theme='light']` and `[data-theme='dark']` and the `prefers-color-scheme: dark` block.

A future build step will generate the CSS automatically from the JSON; for now `semantic.css` is hand-maintained and authoritative.

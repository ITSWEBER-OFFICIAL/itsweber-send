# Brand assets

Marks and guidelines for ITSWEBER Send.

## The mark

`itsweber-send-mark.svg` is the canonical logo: **"Paper Plane Crypt"** — a stylised paper plane carved out of a padlock body. Geometric, single color, scales down to 16×16 px.

The SVG uses `currentColor` for both stroke and fill, so it inherits the surrounding text color. Two recommended brand colors:

| Theme | Color      | Hex                         |
| ----- | ---------- | --------------------------- |
| Light | Teal       | `#3ba7a7` (hover `#2d8a8a`) |
| Dark  | Atom Green | `#3FE48B` (hover `#2dd47a`) |

## Usage rules

- Maintain at least 8 px of clear space around the mark on every side.
- Do not rotate, skew, or recolor outside the two brand colors above.
- Do not place the mark on busy photographic backgrounds. Use a solid surface or a subtle gradient.
- The wordmark is set in **Geist Variable** at 700 weight, with `letter-spacing: -0.02em`. The accent dot (`·`) and the word "Send" appear in the brand color.

## Where it is used

- `apps/web/src/lib/components/BrandMark.svelte` — runtime React-of-Svelte component, inherits color from CSS context.
- `apps/web/static/favicon.svg` — favicon (with explicit teal color baked in).
- `README.md` — repository hero.
- HTML previews under `docs/previews/` — visual reference.

## Source files

- `itsweber-send-mark.svg` — the mark, monochrome, currentColor.
- (To be added in a later milestone:) PNG renders at 256, 512 and 1024 px for stores that do not accept SVG.

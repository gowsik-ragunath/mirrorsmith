# Motion reference (subtle polish)

Motion values below are fixed — use them verbatim, don't improvise or tune. This
reference lines up with the values used in the `better-ui` skill (exact durations,
easings and cues), trimmed to what a pixel-verified static clone can accept.

## When polish applies

Only after the diff passes (every kept section ≤1% mismatch), only if the user asked
for polish, and only shaped so the page **settles into the exact layout the diff
verified** — no motion changes any resting size or position. The static screenshot
after the polish must still be within threshold.

## Base interval

- Interactive pages move often; keep motion sparse and stable.
- Keyframes for one-time orderings (page entrance) only. Everything else is a CSS
  transition on named properties.
- Never `transition: all`. Name the properties that change (`opacity`,
  `transform`, `filter`).

## Entrance (per section, once)

```css
@media (prefers-reduced-motion: no-preference) {
  .m-enter {
    opacity: 0;
    transform: translateY(12px);
    filter: blur(4px);
    animation: m-in 300ms ease-out both;
  }
  @keyframes m-in {
    to { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
}
@media (prefers-reduced-motion: reduce) {
  .m-enter { animation: m-in-reduced 300ms ease-out both; }
  @keyframes m-in-reduced { from { opacity: 0; } to { opacity: 1; } }
}
```

- Stagger chunks in a stage by 100ms each, using `animation-delay`.
- Each chunk is a semantic unit: heading, paragraph, action row — not per-word or
  per-item.

## Buttons and other interactives

```css
/* pressed */
:not(:disabled):active { transform: scale(0.96); transition: transform 150ms ease-out; }
/* never on :disabled */

/* hover (pointer-capable devices only) */
@media (hover: hover) {
  a:hover, button:hover { opacity: 0.85; transition-property: opacity; transition-duration: 150ms; }
}
/* Tailwind 4's hover: variant already compiles inside @media (hover: hover) — keep classes, never raw :hover */
```

- No bounce anywhere (`bounce: 0` if a library is used).
- Duration on opacity/color transitions ≤150ms; instant for text and row hovers.

## Reduced motion

Everything animated is gated by `prefers-reduced-motion`. Under reduced motion,
movement is replaced by an opacity cross-fade of the same duration; the element is
never removed instantly. Do not rely on motion to carry meaning alone — the resting
state must be identifiable without it.

## Fixed-value quick reference

| Motion | Value |
| --- | --- |
| Entrance duration / easing | 300ms / ease-out |
| Entrance offsets | opacity 0→1, translateY 12px→0, blur 4px→0 |
| Stagger | 100ms per chunk |
| Press scale | 0.96, 150ms ease-out, disabled excluded |
| Icon cross-fade | scale 0.25→1, opacity 0→1, blur 4px→0, 300ms |
| Hover opacity/color change | ≤150ms, named properties |
| Reduced-motion fallback | opacity-only cross-fade, same duration |

## Anti-pattern guards

- `transition: all` → name the properties.
- `animation:` on `:hover` or a toggled class → animate with transition instead.
- `:active` scale without a `:disabled` exclusion.
- `opacity: 0` resting in a base rule that only an animation reveals → hide in the
  `from` keyframe with `animation-fill-mode: both`.
- Any animated property never declared → `will-change` on it only if measured
  stuttering occurs (and name it, e.g. `transform` — never `all`).
- Hover styling without `@media (hover: hover)` stuck on a touch device.

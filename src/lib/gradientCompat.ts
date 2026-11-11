/**
 * Gradient directions for engines that cannot interpolate in `oklab`.
 *
 * Tailwind 4 writes a gradient's direction as an interpolation method as well
 * as a direction: `--tw-gradient-position: to right in oklab`. The stops are
 * then consumed by `linear-gradient(var(--tw-gradient-stops))`.
 *
 * `in oklab` is Chrome 111 / Safari 16.2 / Firefox 113. On anything older the
 * whole `linear-gradient()` value is invalid, so `background-image` is dropped
 * entirely — not just the interpolation, the gradient. Two consequences, both
 * reported as "the colour and the words do not show on some devices":
 *
 *  - A heading that paints itself with `bg-clip-text text-transparent` has a
 *    transparent colour and a background that never painted, so it renders as
 *    nothing at all. That is the invisible-words case.
 *  - The dark scrim over the hero video is a gradient too, so white copy sits
 *    directly on a bright frame and cannot be read. Same complaint, other
 *    direction.
 *
 * The same engines also lack `@property`, which is where Tailwind's gradient
 * position variables (`--tw-gradient-from-position` and friends) get their
 * initial values. Without it those `var()`s are invalid, which poisons
 * `--tw-gradient-stops` even once the direction is fixed. So a fallback has to
 * restate both the direction and the three positions.
 *
 * `styles.css` carries that fallback in a single `@supports not (... in oklab
 * ...)` block. This module is the table it is generated from, and the test next
 * to it fails if a direction is used in the app without a fallback entry — the
 * one way this can silently rot.
 */

/** Tailwind's `bg-gradient-to-*` utility mapped to the plain CSS direction. */
export const GRADIENT_DIRECTION: Record<string, string> = {
  "bg-gradient-to-t": "to top",
  "bg-gradient-to-tr": "to top right",
  "bg-gradient-to-r": "to right",
  "bg-gradient-to-br": "to bottom right",
  "bg-gradient-to-b": "to bottom",
  "bg-gradient-to-bl": "to bottom left",
  "bg-gradient-to-l": "to left",
  "bg-gradient-to-tl": "to top left",
};

/** Every direction Tailwind can emit, longest-first so no prefix is shadowed. */
export const GRADIENT_UTILITIES = Object.keys(GRADIENT_DIRECTION);

const USED = /\bbg-gradient-to-(?:t|tr|r|br|b|bl|l|tl)\b/g;

/** The `bg-gradient-to-*` utilities that appear in a chunk of source. */
export function directionsUsedIn(source: string): string[] {
  return [...new Set(source.match(USED) ?? [])].sort();
}

/** The plain direction for a utility, or `null` when it is not a direction. */
export function plainDirectionFor(utility: string): string | null {
  return GRADIENT_DIRECTION[utility] ?? null;
}

/**
 * Pie-chart slice palette (KII-108).
 *
 * Curated 12-color palette spanning the hue wheel, assigned to slices by
 * `assignSliceColors()` in `src/utils/chart-slice-colors.ts`. Two low-chroma
 * neutrals (cocoa, slate) sit at the tail to absorb hash-shift fallbacks.
 *
 * Invariants enforced by tests in __tests__/chart-colors.test.ts:
 *   - Every entry contrasts ≥3:1 against the cream paper surface (WCAG 1.4.11).
 *   - Pairwise CIEDE2000 ΔE2000 ≥ 12 between every entry.
 *   - ΔE2000 ≥ 8 vs each semantic theme color (negative, positive, info, warning, accent).
 *
 * Order rationale: entries are arranged so the first ~6 visible slices (legend
 * max) walk the hue wheel (red-orange → yellow → green → cyan → blue → purple
 * → magenta → pink → wine), and the final two are warm/cool neutrals used by
 * the hash-shift fallback in `assignSliceColors`.
 */
export const CHART_SLICE_PALETTE: readonly string[] = [
	'#C7553F', // coral (red-orange)
	'#997620', // mustard (dark yellow)
	'#6B8030', // olive (yellow-green)
	'#2A8580', // teal (cyan-green)
	'#3A6BC5', // sapphire (vivid blue)
	'#3F2E75', // indigo (deep purple-blue)
	'#7C4FA6', // violet (purple)
	'#A23F88', // magenta (pink-magenta)
	'#D14A66', // rose (pink-red)
	'#872842', // wine (dark burgundy)
	'#7A5A3D', // cocoa (warm brown neutral)
	'#5A6275', // slate (cool gray neutral)
] as const;

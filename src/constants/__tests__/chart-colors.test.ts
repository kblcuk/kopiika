import { describe, test, expect } from 'bun:test';
import { CHART_SLICE_PALETTE } from '../chart-colors';
import { colors } from '@/src/theme/colors';
import { deltaE2000, contrastRatio } from '@/src/utils/chart-slice-colors';

// ── Thresholds ───────────────────────────────────────────────────────────────
// WCAG 2.2 SC 1.4.11 — graphical objects need ≥3:1 against adjacent colors.
// Pie slices are graphical objects, not text, so we hold to 3:1 rather than
// the 4.5:1 bar applied to the user-pickable entity palette.
const SURFACE_CONTRAST_MIN = 3.0;

// CIEDE2000 pairwise floor — stricter than the 10 used for entity bubbles
// because pie slices sit immediately adjacent on a single visual surface.
const PALETTE_PAIRWISE_DELTA_E_MIN = 12;

// Distance from each semantic theme color, to keep slices from being
// misread as "this is overspend/positive/warning/etc".
const SEMANTIC_SEPARATION_DELTA_E_MIN = 8;

describe('CHART_SLICE_PALETTE shape', () => {
	test('contains exactly 12 entries', () => {
		expect(CHART_SLICE_PALETTE.length).toBe(12);
	});

	test('every entry is a hex color string', () => {
		const hexPattern = /^#[0-9A-Fa-f]{6}$/;
		for (const hex of CHART_SLICE_PALETTE) {
			expect(hex).toMatch(hexPattern);
		}
	});
});

describe('CHART_SLICE_PALETTE accessibility', () => {
	test(`every entry has ≥${SURFACE_CONTRAST_MIN}:1 contrast against paper.DEFAULT`, () => {
		for (const hex of CHART_SLICE_PALETTE) {
			const ratio = contrastRatio(hex, colors.paper.DEFAULT);
			expect(ratio, `${hex} vs paper ${colors.paper.DEFAULT}`).toBeGreaterThanOrEqual(
				SURFACE_CONTRAST_MIN
			);
		}
	});

	test(`every entry has ≥${SURFACE_CONTRAST_MIN}:1 contrast against paper[50]`, () => {
		for (const hex of CHART_SLICE_PALETTE) {
			const ratio = contrastRatio(hex, colors.paper[50]);
			expect(ratio, `${hex} vs paper[50] ${colors.paper[50]}`).toBeGreaterThanOrEqual(
				SURFACE_CONTRAST_MIN
			);
		}
	});

	test(`every pair is perceptually distinct (ΔE2000 ≥ ${PALETTE_PAIRWISE_DELTA_E_MIN})`, () => {
		for (let i = 0; i < CHART_SLICE_PALETTE.length; i++) {
			for (let j = i + 1; j < CHART_SLICE_PALETTE.length; j++) {
				const a = CHART_SLICE_PALETTE[i]!;
				const b = CHART_SLICE_PALETTE[j]!;
				const distance = deltaE2000(a, b);
				expect(
					distance,
					`${a} vs ${b} — ΔE2000=${distance.toFixed(2)}`
				).toBeGreaterThanOrEqual(PALETTE_PAIRWISE_DELTA_E_MIN);
			}
		}
	});

	test(`every entry is ΔE2000 ≥ ${SEMANTIC_SEPARATION_DELTA_E_MIN} from each semantic theme color`, () => {
		const semantic = {
			negative: colors.negative.DEFAULT,
			positive: colors.positive.DEFAULT,
			info: colors.info.DEFAULT,
			warning: colors.warning.DEFAULT,
			accent: colors.accent.DEFAULT,
		};
		for (const hex of CHART_SLICE_PALETTE) {
			for (const [name, themeHex] of Object.entries(semantic)) {
				const distance = deltaE2000(hex, themeHex);
				expect(
					distance,
					`${hex} vs ${name} ${themeHex} — ΔE2000=${distance.toFixed(2)}`
				).toBeGreaterThanOrEqual(SEMANTIC_SEPARATION_DELTA_E_MIN);
			}
		}
	});
});

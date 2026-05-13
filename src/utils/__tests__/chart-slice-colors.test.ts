import { describe, test, expect } from 'bun:test';
import { assignSliceColors, deltaE2000 } from '../chart-slice-colors';
import { CHART_SLICE_PALETTE } from '@/src/constants/chart-colors';

const NEIGHBOR_DELTA_E_MIN = 12;

describe('assignSliceColors', () => {
	test('returns [] for empty input', () => {
		expect(assignSliceColors([])).toEqual([]);
	});

	test('returns a single palette color for a single slice', () => {
		const result = assignSliceColors([{ id: 'cat-1' }]);
		expect(result).toHaveLength(1);
		expect(CHART_SLICE_PALETTE).toContain(result[0]!);
	});

	test('is deterministic — same input array yields same output', () => {
		const input = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		const first = assignSliceColors(input);
		const second = assignSliceColors(input);
		expect(second).toEqual(first);
	});

	test('two ids that hash to the same preferred index get different colors', () => {
		// Pick two ids known to hash to the same slot. Since the hash is
		// content-defined, we construct ids whose char-code sums are
		// congruent mod 12 (palette length).
		// "aa" → 97+97 = 194; "bz" → 98+122 = 220; both mod 12 differ.
		// Use shorter: "ab" → 195 (mod 12 = 3); "ba" → 195 (mod 12 = 3).
		const [colorA, colorB] = assignSliceColors([{ id: 'ab' }, { id: 'ba' }]);
		expect(colorA).not.toBe(colorB);
	});

	test('produces only palette colors', () => {
		const ids = Array.from({ length: 10 }, (_, i) => ({ id: `entity-${i}` }));
		const result = assignSliceColors(ids);
		for (const color of result) {
			expect(CHART_SLICE_PALETTE).toContain(color);
		}
	});

	test(`every adjacent pair in the output is ΔE2000 ≥ ${NEIGHBOR_DELTA_E_MIN}`, () => {
		// Run a fuzz of 100 random id arrays of length 1–12. For each,
		// verify the output's *pairwise* distinctness (not just adjacent)
		// because slices in a pie chart sit on a continuous ring.
		const rng = mulberry32(0xc0ffee);
		for (let iter = 0; iter < 100; iter++) {
			const len = 1 + Math.floor(rng() * 12);
			const ids = Array.from({ length: len }, () => ({
				id: Math.floor(rng() * 1e9).toString(36),
			}));
			const result = assignSliceColors(ids);
			for (let i = 0; i < result.length; i++) {
				for (let j = i + 1; j < result.length; j++) {
					const d = deltaE2000(result[i]!, result[j]!);
					expect(
						d,
						`iter=${iter} ids=${JSON.stringify(ids)} colors=${JSON.stringify(result)} pair (${i},${j})`
					).toBeGreaterThanOrEqual(NEIGHBOR_DELTA_E_MIN);
				}
			}
		}
	});
});

// Deterministic seeded PRNG for fuzz-test reproducibility.
function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

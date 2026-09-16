// KII-148: the board background is animated between two colours, and every
// bubble renders its label and amount straight onto it — there is no card or
// backdrop in between. So the edit tint is not a free choice: darkening it to
// make the mode more obvious eats the same luminance budget the text contrast
// spends, and the first casualty is the `positive` amount, which clears AA on
// paper-50 by only 11%.
//
// This guards the requirement rather than the value: whatever colour the tint
// becomes, the text on top of it has to stay readable.
import { colors } from '../../theme/colors';

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
	const channels = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(fg: string, bg: string): number {
	const a = luminance(fg);
	const b = luminance(bg);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** sRGB -> CIELAB (D65), for the perceptual distance between the two surfaces. */
function toLab(hex: string): [number, number, number] {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];

	// D65 white point.
	const xyz: [number, number, number] = [
		(r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047,
		r * 0.2126729 + g * 0.7151522 + b * 0.072175,
		(r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883,
	];
	const [fx, fy, fz] = xyz.map((t) =>
		t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29
	) as [number, number, number];

	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(a: string, b: string): number {
	const la = toLab(a);
	const lb = toLab(b);
	return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

// Everything the board paints directly onto its own surface, as text. Bubble
// labels and the two sub-lines are `text-ink` / `text-ink-muted` / `text-info`;
// the amount line switches between `text-ink`, `text-positive` and
// `text-negative` — all of it at 14px or smaller, so AA is 4.5 and none of it
// qualifies for the large-text allowance.
const BOARD_TEXT = {
	ink: colors.ink.DEFAULT,
	'ink.muted': colors.ink.muted,
	info: colors.info.DEFAULT,
	positive: colors.positive.DEFAULT,
	negative: colors.negative.DEFAULT,
};

const AA_NORMAL_TEXT = 4.5;

describe('board surface contrast', () => {
	for (const [mode, surface] of [
		['recording', colors.paper[50]],
		['edit', colors.paper.edit],
	] as const) {
		test(`every board text colour clears AA on the ${mode} surface`, () => {
			for (const [name, fg] of Object.entries(BOARD_TEXT)) {
				expect({ name, ratio: contrast(fg, surface) >= AA_NORMAL_TEXT }).toEqual({
					name,
					ratio: true,
				});
			}
		});
	}

	// The tint is the mode's only always-visible signal, so it also has to be
	// tellable from the untinted board. CIE76 is crude but honest here: both
	// surfaces are near-white, where it tracks CIEDE2000 closely enough to use
	// as a floor. ~2.3 is the just-noticeable threshold, and the tint cannot go
	// much past 7 without `positive` dropping under AA (see `paper.edit`) — so
	// this floor guards against someone softening it back toward invisible
	// rather than leaving headroom to grow into. The colour shipped at 7.0.
	test('the edit tint is distinguishable from the recording surface', () => {
		expect(deltaE76(colors.paper.edit, colors.paper[50])).toBeGreaterThan(6.5);
	});
});

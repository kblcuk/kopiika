import { describe, test, expect } from 'bun:test';
import { ENTITY_COLOR_PALETTE } from '../entity-colors';
import { getEntityTypeDefaults } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import type { EntityColorKey, EntityType } from '@/src/types';

describe('ENTITY_COLOR_PALETTE', () => {
	test('contains all 8 palette keys', () => {
		const keys: EntityColorKey[] = [
			'amethyst',
			'emerald',
			'sapphire',
			'ruby',
			'jade',
			'amber',
			'lilac',
			'teal',
		];
		for (const key of keys) {
			expect(ENTITY_COLOR_PALETTE[key]).toBeDefined();
		}
	});

	test('each entry has bgColor and iconColor as hex strings', () => {
		const hexPattern = /^#[0-9A-Fa-f]{6}$/;
		for (const entry of Object.values(ENTITY_COLOR_PALETTE)) {
			expect(entry.bgColor).toMatch(hexPattern);
			expect(entry.iconColor).toMatch(hexPattern);
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility regression tests
//
// Static checks guard both the user-pickable palette and the per-entity-type
// defaults against four real-world failure modes:
//
//   1. Icon glyphs unreadable on their own bubble background.
//   2. Icon glyphs unreadable when the bubble sits on the cream paper surface
//      (the picker's selected-state Check, the entity bubble icon, etc).
//   3. Two palette entries that look "the same colour" at a glance — exactly
//      the bug KII-107 describes (jade ≈ emerald, amethyst ≈ lilac).
//   4. Per-type defaults whose semantic tints + icons drop below the WCAG
//      non-text contrast floor.
//
// All checks are pure functions over the constants, run in the standard bun
// test suite, and add no new dependencies.
// ─────────────────────────────────────────────────────────────────────────────

// ── Colour math ──────────────────────────────────────────────────────────────
// All formulas below are reference implementations of public specs; no library
// dependency. Inlined here because they're only used by these tests — promote
// to a util module if a second consumer appears.

// Parse "#RRGGBB" → [r, g, b] in 0..255.
const hexToRgb = (hex: string): [number, number, number] => {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

// sRGB channel → linear-light. Per IEC 61966-2-1 / WCAG 2.x relative-luminance
// definition: https://www.w3.org/WAI/GL/wiki/Relative_luminance
const srgbToLinear = (c8: number): number => {
	const c = c8 / 255;
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

// Relative luminance Y (D65 weights). Same source as above.
const relativeLuminance = (hex: string): number => {
	const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG 2.x contrast ratio. Range 1..21.
// Spec: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
const contrastRatio = (a: string, b: string): number => {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// sRGB → CIE XYZ (D65). Bradford-adapted matrix from the sRGB spec /
// http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
const rgbToXyz = (hex: string): [number, number, number] => {
	const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
	return [
		0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
		0.2126729 * r + 0.7151522 * g + 0.072175 * b,
		0.0193339 * r + 0.119192 * g + 0.9503041 * b,
	];
};

// CIE XYZ → CIE L*a*b*. D65 reference white (Xn, Yn, Zn).
// Spec: CIE 15:2004 §8.2.1; readable summary at
// http://www.brucelindbloom.com/index.html?Eqn_XYZ_to_Lab.html
const xyzToLab = ([x, y, z]: [number, number, number]): [number, number, number] => {
	const Xn = 0.95047;
	const Yn = 1.0;
	const Zn = 1.08883;
	const delta = 6 / 29;
	const f = (t: number): number =>
		t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
	const fx = f(x / Xn);
	const fy = f(y / Yn);
	const fz = f(z / Zn);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

// CIEDE2000 colour-difference formula. The CIE's 2000 successor to CIE76,
// adopted as ISO 11664-6:2014 / CIE S 014-6. CIE76 (simple Lab Euclidean
// distance) is known to over-penalise differences in saturated regions and
// under-penalise in desaturated/blue regions; CIEDE2000 corrects with
// chroma/hue/lightness weighting + a hue-rotation term that fixes the blue
// non-linearity. Worth the ~40 extra lines: reduces false positives at the
// threshold boundary and matches what every modern colour tool (color.js,
// Sharp, Pillow, Photoshop) reports today.
//
// Reference impl follows Sharma, Wu, Dalal (2005) "The CIEDE2000 Color-
// Difference Formula: Implementation Notes, Supplementary Test Data, and
// Mathematical Observations":
//   http://www2.ece.rochester.edu/~gsharma/ciede2000/ciede2000noteCRNA.pdf
const deltaE2000 = (hex1: string, hex2: string): number => {
	const [L1, a1, b1] = xyzToLab(rgbToXyz(hex1));
	const [L2, a2, b2] = xyzToLab(rgbToXyz(hex2));
	const rad = (deg: number): number => (deg * Math.PI) / 180;
	const deg = (r: number): number => (r * 180) / Math.PI;

	// Step 1: chroma adjustment for low-chroma desensitivity.
	const C1 = Math.hypot(a1, b1);
	const C2 = Math.hypot(a2, b2);
	const Cbar = (C1 + C2) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
	const a1p = a1 * (1 + G);
	const a2p = a2 * (1 + G);
	const C1p = Math.hypot(a1p, b1);
	const C2p = Math.hypot(a2p, b2);
	const h1p = ((deg(Math.atan2(b1, a1p)) % 360) + 360) % 360;
	const h2p = ((deg(Math.atan2(b2, a2p)) % 360) + 360) % 360;

	// Step 2: differences (with shortest-path hue arithmetic).
	const dLp = L2 - L1;
	const dCp = C2p - C1p;
	let dhp: number;
	if (C1p * C2p === 0) dhp = 0;
	else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
	else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
	else dhp = h2p - h1p + 360;
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

	// Step 3: weighting functions and rotation term.
	const Lbarp = (L1 + L2) / 2;
	const Cbarp = (C1p + C2p) / 2;
	let hbarp: number;
	if (C1p * C2p === 0) hbarp = h1p + h2p;
	else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
	else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
	else hbarp = (h1p + h2p - 360) / 2;

	const T =
		1 -
		0.17 * Math.cos(rad(hbarp - 30)) +
		0.24 * Math.cos(rad(2 * hbarp)) +
		0.32 * Math.cos(rad(3 * hbarp + 6)) -
		0.2 * Math.cos(rad(4 * hbarp - 63));
	const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
	const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
	const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
	const Sc = 1 + 0.045 * Cbarp;
	const Sh = 1 + 0.015 * Cbarp * T;
	const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

	return Math.sqrt(
		(dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh)
	);
};

// Alpha-blend an "rgba(r, g, b, a)" string over an opaque hex base.
// Standard Porter-Duff "source-over" with opaque destination:
//   result = src.rgb * src.a + dst.rgb * (1 - src.a)
// Used to compute the *effective* bgColor when an entity-type default
// declares its bubble as a translucent tint over the paper surface.
const blendOverPaper = (rgba: string, paper: string): string => {
	const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
	if (!m) throw new Error(`Not an rgba() string: ${rgba}`);
	const [, rs, gs, bs, as] = m as unknown as [string, string, string, string, string];
	const A = parseFloat(as);
	const [br, bg, bb] = hexToRgb(paper);
	const mix = (s: string, d: number): number => Math.round(parseInt(s, 10) * A + d * (1 - A));
	const r = mix(rs, br);
	const g = mix(gs, bg);
	const b = mix(bs, bb);
	return (
		'#' +
		[r, g, b]
			.map((v) => v.toString(16).padStart(2, '0'))
			.join('')
			.toUpperCase()
	);
};

// Resolve a bgColor that may be either an opaque hex or an rgba() tint to
// the opaque colour the eye actually sees on the cream surface.
const effectiveBg = (bgColor: string, paper: string): string =>
	bgColor.startsWith('rgba') ? blendOverPaper(bgColor, paper) : bgColor;

// ── Thresholds ───────────────────────────────────────────────────────────────

// WCAG 2.2 SC 1.4.3 ("Contrast (Minimum)") — 4.5:1 for normal text.
// Picker check icons and entity-bubble glyphs are small (≤14 px), so we hold
// to the stricter 4.5 threshold rather than the 3.0 large-text allowance.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
const CONTRAST_MIN = 4.5;

// WCAG 2.2 SC 1.4.11 ("Non-text Contrast") — 3:1 for graphical objects and
// UI component states. Lucide icons rendered in entity bubbles qualify as
// graphical objects (they're informational, not decorative). We use this
// looser bar for the entity-type defaults below because the 10%-tinted
// semantic backgrounds are an intentional design choice that can't reach
// 4.5:1 without a broader redesign.
// https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
const NON_TEXT_CONTRAST_MIN = 3.0;

// CIEDE2000 perceptual bands (industry consensus across textile, print, and
// display research; CIE TC1-47 commentary):
//   ΔE2000 < 1     — imperceptible
//   ΔE2000 1–2     — perceivable to a trained eye
//   ΔE2000 2–3.5   — perceivable at a glance
//   ΔE2000 3.5–5   — clearly different
//   ΔE2000 5+      — categorically different
// We pick 10, deep inside the "categorically different" zone, because:
//   (a) swatches are tiny (28 px) and side-by-side, where the perceptual
//       threshold rises;
//   (b) we need to remain robust against display gamut variation;
//   (c) 10 still leaves room for new palette entries — the closest current
//       pair sits at 12.14 (jade ↔ emerald), with 2.14 of headroom.
// The old jade≈emerald and amethyst≈lilac collisions sit at ΔE2000 ≈ 3-5
// (well below 10), so the test catches the exact regression class that
// produced KII-107.
const DELTA_E_MIN = 10;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ENTITY_COLOR_PALETTE accessibility', () => {
	test('every iconColor has WCAG AA contrast (≥4.5:1) against its bgColor', () => {
		for (const [key, { bgColor, iconColor }] of Object.entries(ENTITY_COLOR_PALETTE)) {
			const ratio = contrastRatio(iconColor, bgColor);
			expect(ratio, `${key}: icon ${iconColor} on bg ${bgColor}`).toBeGreaterThanOrEqual(
				CONTRAST_MIN
			);
		}
	});

	test('every iconColor has WCAG AA contrast (≥4.5:1) against the paper surface', () => {
		const paper = colors.paper.DEFAULT;
		for (const [key, { iconColor }] of Object.entries(ENTITY_COLOR_PALETTE)) {
			const ratio = contrastRatio(iconColor, paper);
			expect(ratio, `${key}: icon ${iconColor} on paper ${paper}`).toBeGreaterThanOrEqual(
				CONTRAST_MIN
			);
		}
	});

	test(`every pair of bgColors is perceptually distinct (ΔE2000 ≥ ${DELTA_E_MIN})`, () => {
		const entries = Object.entries(ENTITY_COLOR_PALETTE);
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				const [ka, va] = entries[i]!;
				const [kb, vb] = entries[j]!;
				const distance = deltaE2000(va.bgColor, vb.bgColor);
				expect(
					distance,
					`${ka} (${va.bgColor}) vs ${kb} (${vb.bgColor}) — ΔE2000=${distance.toFixed(2)}`
				).toBeGreaterThanOrEqual(DELTA_E_MIN);
			}
		}
	});
});

// Entity-type defaults are the colours every bubble falls back to when no
// custom palette key has been picked. Three of the four bgColors are 10%
// tints of a semantic colour over paper, so they need alpha-blending before
// any contrast check is meaningful.
//
// We hold these to WCAG 1.4.11 (≥ 3:1 for graphical objects) — looser than
// the 4.5:1 bar applied to the user-pickable palette above. The reason: the
// soft semantic tints are an intentional design choice and tightening to
// 4.5:1 would force a redesign of every bubble. 3:1 is the WCAG-mandated
// floor; passing it is the bar to clear.
//
// NOTE: as of writing, `income` clears the 3:1 bar by 0.01 (3.01 vs paper-
// blended bg). If a future tweak nudges the alpha or the accent hex even
// slightly, this test will catch it — exactly what we want.
describe('entity-type defaults accessibility', () => {
	const types: EntityType[] = ['income', 'account', 'category', 'saving'];
	const paper = colors.paper.DEFAULT;

	test(`every iconColor has WCAG 1.4.11 contrast (≥${NON_TEXT_CONTRAST_MIN}:1) on its effective bg`, () => {
		for (const type of types) {
			const { bgColor, iconColor } = getEntityTypeDefaults(type);
			const effective = effectiveBg(bgColor, paper);
			const ratio = contrastRatio(iconColor, effective);
			expect(
				ratio,
				`${type}: icon ${iconColor} on effective bg ${effective} (raw ${bgColor})`
			).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_MIN);
		}
	});

	test(`every iconColor has WCAG 1.4.11 contrast (≥${NON_TEXT_CONTRAST_MIN}:1) against paper`, () => {
		for (const type of types) {
			const { iconColor } = getEntityTypeDefaults(type);
			const ratio = contrastRatio(iconColor, paper);
			expect(ratio, `${type}: icon ${iconColor} on paper ${paper}`).toBeGreaterThanOrEqual(
				NON_TEXT_CONTRAST_MIN
			);
		}
	});
});

import { CHART_SLICE_PALETTE } from '@/src/constants/chart-colors';

/**
 * Runtime check threshold. Equals the palette's static pairwise floor (12) so
 * any two distinct palette entries always clear this check. In practice the
 * shift therefore only triggers when two ids hash to the same preferred
 * index — which is the desired behaviour.
 */
const NEIGHBOR_DELTA_E_MIN = 12;

/**
 * Knuth multiplicative constant (2^32 / golden ratio). Yields well-distributed
 * indices for short strings with a tiny implementation, no external dependency.
 */
const KNUTH_MULTIPLIER = 2654435761;

/**
 * Deterministically assign a palette color to each slice.
 *
 * Algorithm:
 *   1. Compute preferred index = hash(id) % palette.length.
 *   2. Walk forward from preferred; pick the first candidate whose ΔE2000
 *      from every already-assigned slice is ≥ NEIGHBOR_DELTA_E_MIN.
 *   3. Because the palette is statically guaranteed pairwise ΔE2000 ≥ 12,
 *      the walk in practice only triggers when two ids hash to the same
 *      preferred index.
 *
 * Properties:
 *   - Pure: same input array → same output array.
 *   - O(N²) ΔE2000 calls; trivially fast for N ≤ 12 slices.
 *   - Same entity id usually keeps the same color across views (good for
 *     visual continuity); only shifts when forced by collision.
 */
export function assignSliceColors(slices: readonly { id: string }[]): string[] {
	const out: string[] = [];
	for (const slice of slices) {
		const preferred = hashToIndex(slice.id, CHART_SLICE_PALETTE.length);
		let pickIdx = preferred;
		for (let step = 0; step < CHART_SLICE_PALETTE.length; step++) {
			const idx = (preferred + step) % CHART_SLICE_PALETTE.length;
			const candidate = CHART_SLICE_PALETTE[idx]!;
			if (out.every((c) => deltaE2000(c, candidate) >= NEIGHBOR_DELTA_E_MIN)) {
				pickIdx = idx;
				break;
			}
			// Pathological case (palette exhausted without finding a distinct
			// candidate): pickIdx was never updated, so we fall back to the
			// preferred index. Only reachable when slices > palette.length;
			// the chart truncates those with a "+ N more" legend entry anyway.
		}
		out.push(CHART_SLICE_PALETTE[pickIdx]!);
	}
	return out;
}

// ── Internal: hash ───────────────────────────────────────────────────────────

function hashToIndex(id: string, modulo: number): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = (h + id.charCodeAt(i)) | 0;
	}
	h = Math.imul(h, KNUTH_MULTIPLIER);
	// Force unsigned, then mod.
	return (h >>> 0) % modulo;
}

// ── Color math (exported for test reuse) ─────────────────────────────────────
// Reference implementations of public specs; no library dependency. Kept
// inline rather than promoted to a shared module — see spec § "Out of Scope".

const hexToRgb = (hex: string): [number, number, number] => {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

const srgbToLinear = (c8: number): number => {
	const c = c8 / 255;
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const relativeLuminance = (hex: string): number => {
	const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * WCAG 2.x contrast ratio. Range 1..21.
 * Spec: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */
export const contrastRatio = (a: string, b: string): number => {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const rgbToXyz = (hex: string): [number, number, number] => {
	const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
	return [
		0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
		0.2126729 * r + 0.7151522 * g + 0.072175 * b,
		0.0193339 * r + 0.119192 * g + 0.9503041 * b,
	];
};

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

/**
 * CIEDE2000 color-difference formula. ISO 11664-6:2014 / CIE S 014-6.
 * Reference impl follows Sharma, Wu, Dalal (2005).
 *   http://www2.ece.rochester.edu/~gsharma/ciede2000/ciede2000noteCRNA.pdf
 */
export const deltaE2000 = (hex1: string, hex2: string): number => {
	const [L1, a1, b1] = xyzToLab(rgbToXyz(hex1));
	const [L2, a2, b2] = xyzToLab(rgbToXyz(hex2));
	const rad = (deg: number): number => (deg * Math.PI) / 180;
	const deg = (r: number): number => (r * 180) / Math.PI;

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

	const dLp = L2 - L1;
	const dCp = C2p - C1p;
	let dhp: number;
	if (C1p * C2p === 0) dhp = 0;
	else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
	else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
	else dhp = h2p - h1p + 360;
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

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

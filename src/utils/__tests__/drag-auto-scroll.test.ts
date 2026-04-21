import { describe, it, expect } from 'bun:test';
import { computeEdgeSpeed, SECTION_INDEX } from '../drag-auto-scroll';

const SIZE = 800;
const EDGE_ZONE = 80;
const MAX_SPEED = 14;

describe('computeEdgeSpeed', () => {
	it('returns 0 when position is in the center', () => {
		expect(computeEdgeSpeed(400, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(0);
	});

	it('returns positive speed near the end edge', () => {
		// 40px into the 80px end zone → proximity 0.5
		const speed = computeEdgeSpeed(SIZE - 40, SIZE, EDGE_ZONE, MAX_SPEED);
		expect(speed).toBeCloseTo(MAX_SPEED * 0.5);
	});

	it('returns negative speed near the start edge', () => {
		// 40px into the 80px start zone → proximity 0.5
		const speed = computeEdgeSpeed(40, SIZE, EDGE_ZONE, MAX_SPEED);
		expect(speed).toBeCloseTo(-MAX_SPEED * 0.5);
	});

	it('caps speed at maxSpeed when at the very edge', () => {
		expect(computeEdgeSpeed(SIZE, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(MAX_SPEED);
		expect(computeEdgeSpeed(0, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(-MAX_SPEED);
	});

	it('caps speed at maxSpeed when beyond the edge', () => {
		expect(computeEdgeSpeed(SIZE + 50, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(MAX_SPEED);
		expect(computeEdgeSpeed(-50, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(-MAX_SPEED);
	});

	it('returns 0 at exact boundary of edge zone', () => {
		// At exactly the start of end zone (SIZE - EDGE_ZONE) → proximity 0
		expect(computeEdgeSpeed(SIZE - EDGE_ZONE, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(0);
		// At exactly the end of start zone (EDGE_ZONE) → proximity 0
		expect(computeEdgeSpeed(EDGE_ZONE, SIZE, EDGE_ZONE, MAX_SPEED)).toBe(0);
	});

	it('returns +-0 when maxSpeed is 0', () => {
		// Speed formula: maxSpeed * proximity → 0 * anything = +-0
		expect(computeEdgeSpeed(10, SIZE, EDGE_ZONE, 0)).toBeCloseTo(0);
		expect(computeEdgeSpeed(SIZE - 10, SIZE, EDGE_ZONE, 0)).toBeCloseTo(0);
	});

	it('handles overlapping edge zones (edgeZone > size/2)', () => {
		// edgeZone=500, size=800 → end zone starts at 300, start zone ends at 500.
		// Position 300: end check (300 > 300) is false, start check (300 < 500) is true.
		// Start edge wins → negative speed.
		const speed = computeEdgeSpeed(300, 800, 500, 10);
		expect(speed).toBeLessThan(0);
	});

	it('returns 0 when edgeZone is 0', () => {
		// edgeZone=0 → end check (400 > 800) false, start check (400 < 0) false → 0
		expect(computeEdgeSpeed(400, SIZE, 0, MAX_SPEED)).toBe(0);
	});
});

describe('SECTION_INDEX', () => {
	it('maps all four entity types to unique indices 0-3', () => {
		expect(SECTION_INDEX.income).toBe(0);
		expect(SECTION_INDEX.account).toBe(1);
		expect(SECTION_INDEX.category).toBe(2);
		expect(SECTION_INDEX.saving).toBe(3);
	});
});

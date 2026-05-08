import { describe, it, expect } from 'bun:test';
import { computeEdgeSpeed, pickHoveredSection, SECTION_INDEX } from '../drag-auto-scroll';

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

describe('pickHoveredSection', () => {
	// Realistic layout when income is collapsed (initial state):
	// the inner View still measures its natural height, so income's bounds
	// overlap accounts'. Categories/savings sit immediately after.
	const collapsedIncomeBounds = [
		{ top: 12, bot: 182 }, // income (visually hidden, stale natural height)
		{ top: 12, bot: 172 }, // accounts (rendered right after the 0-height wrapper)
		{ top: 172, bot: 632 }, // categories (3 rows)
		{ top: 632, bot: 792 }, // savings
	];

	// Realistic layout when income is expanded — sections don't overlap.
	const expandedIncomeBounds = [
		{ top: 12, bot: 182 }, // income
		{ top: 182, bot: 342 }, // accounts
		{ top: 342, bot: 802 }, // categories
		{ top: 802, bot: 962 }, // savings
	];

	it('returns -1 when bounds are uninitialized (top === bot)', () => {
		const empty = [
			{ top: 0, bot: 0 },
			{ top: 0, bot: 0 },
			{ top: 0, bot: 0 },
			{ top: 0, bot: 0 },
		];
		expect(pickHoveredSection(100, 0, empty, [10, 10, 10, 10])).toBe(-1);
	});

	it('returns the matching section index when finger is in its bounds with overflow', () => {
		// finger over accounts, income expanded, no overlap
		expect(pickHoveredSection(250, 0, expandedIncomeBounds, [0, 200, 400, 0])).toBe(1);
	});

	it('returns -1 when finger sits below all sections', () => {
		expect(pickHoveredSection(2000, 0, expandedIncomeBounds, [200, 200, 400, 200])).toBe(-1);
	});

	it('falls through a hovered section without horizontal overflow', () => {
		// Income is collapsed: its stale bounds overlap with accounts. The
		// loop must skip income (maxH=0) and pick accounts instead. This is
		// the regression at the heart of KII-97.
		const idx = pickHoveredSection(100, 0, collapsedIncomeBounds, [0, 200, 400, 0]);
		expect(idx).toBe(1);
	});

	it('skips both income and accounts when neither has overflow', () => {
		// Income collapsed and accounts also has no overflow (all fit on screen);
		// finger over the visual accounts area should NOT scroll anything.
		const idx = pickHoveredSection(100, 0, collapsedIncomeBounds, [0, 0, 400, 0]);
		expect(idx).toBe(-1);
	});

	it('subtracts the outer scroll offset when comparing to touchY', () => {
		// User scrolled the outer view down by 100px. Accounts sits at content
		// y=182; on screen it's now at y=82. A finger at touchY=100 should hit
		// accounts.
		const idx = pickHoveredSection(100, 100, expandedIncomeBounds, [0, 200, 400, 0]);
		expect(idx).toBe(1);
	});

	it('returns the source-section index when the finger hovers over it', () => {
		// The picker no longer skips the source section — that was the
		// "scroll the section we're hovering on" requirement of KII-97.
		// finger inside categories (the source); only categories has overflow.
		const idx = pickHoveredSection(400, 0, expandedIncomeBounds, [0, 0, 400, 0]);
		expect(idx).toBe(2);
	});

	it('returns the first hovered section with overflow even if a later one also matches', () => {
		// With overlapping bounds, the loop returns the first valid match in
		// rendering order. Income (idx 0) has overflow and contains touchY,
		// so it wins over accounts (which also contains touchY).
		const idx = pickHoveredSection(50, 0, collapsedIncomeBounds, [200, 200, 400, 0]);
		expect(idx).toBe(0);
	});
});

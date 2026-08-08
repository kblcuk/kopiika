import { resolveGridRows } from '@/src/components/entity-grid-layout';

// KII-152: a horizontal Sortable.Grid reserves `rows * (rowHeight + rowGap)`
// regardless of how many items it holds, so a sparsely-filled section has to ask
// for fewer rows or it leaves a dead band under the last bubble.
describe('resolveGridRows', () => {
	it('keeps the full row budget once entities fill it', () => {
		expect(resolveGridRows({ entityCount: 3, maxRows: 3 })).toBe(3);
	});

	it('keeps the full row budget when entities overflow into more columns', () => {
		expect(resolveGridRows({ entityCount: 7, maxRows: 3 })).toBe(3);
	});

	it('shrinks to the rows a partially-filled section actually uses', () => {
		expect(resolveGridRows({ entityCount: 2, maxRows: 3 })).toBe(2);
	});

	it('collapses a lone entity to a single row so the add bubble sits beside it', () => {
		expect(resolveGridRows({ entityCount: 1, maxRows: 3 })).toBe(1);
	});

	it('never asks for zero rows, which the grid rejects', () => {
		expect(resolveGridRows({ entityCount: 0, maxRows: 3 })).toBe(1);
	});

	it('leaves single-row sections alone', () => {
		expect(resolveGridRows({ entityCount: 5, maxRows: 1 })).toBe(1);
	});
});

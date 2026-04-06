import { resolveGridDragEnd } from '../sortable-entity-grid-logic';

describe('resolveGridDragEnd', () => {
	const orderedIds = ['a', 'b', 'c'];

	describe('transaction mode', () => {
		it('returns transaction for cross-type drop (account → category)', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'account',
					targetType: 'category',
					targetId: 'cat-1',
					orderedIds,
				})
			).toEqual({ kind: 'transaction', targetId: 'cat-1' });
		});

		it('returns transaction for account → account (same-type transfer)', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'account',
					targetType: 'account',
					targetId: 'acc-2',
					orderedIds,
				})
			).toEqual({ kind: 'transaction', targetId: 'acc-2' });
		});

		it('returns transaction for income → account', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'income',
					targetType: 'account',
					targetId: 'acc-1',
					orderedIds,
				})
			).toEqual({ kind: 'transaction', targetId: 'acc-1' });
		});

		it('blocks outgoing transactions from savings', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'saving',
					targetType: 'account',
					targetId: 'acc-1',
					orderedIds,
				})
			).toEqual({ kind: 'none' });
		});

		it('returns none when same non-account type (category → category)', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'category',
					targetType: 'category',
					targetId: 'cat-2',
					orderedIds,
				})
			).toEqual({ kind: 'none' });
		});

		it('returns none when targetId is null (dropped in empty space)', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'account',
					targetType: null,
					targetId: null,
					orderedIds,
				})
			).toEqual({ kind: 'none' });
		});

		it('returns none when targetType is null but targetId exists', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'account',
					targetType: null,
					targetId: 'orphan',
					orderedIds,
				})
			).toEqual({ kind: 'none' });
		});
	});

	describe('reorder mode', () => {
		it('returns reorder with ordered IDs', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'reorder',
					sourceType: 'account',
					targetType: null,
					targetId: null,
					orderedIds,
				})
			).toEqual({ kind: 'reorder', orderedIds });
		});

		it('returns reorder even when a target is present (reorder takes priority)', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'reorder',
					sourceType: 'account',
					targetType: 'category',
					targetId: 'cat-1',
					orderedIds,
				})
			).toEqual({ kind: 'reorder', orderedIds });
		});
	});
});

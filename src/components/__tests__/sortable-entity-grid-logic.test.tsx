import { resolveGridDragEnd } from '../sortable-entity-grid-logic';

describe('resolveGridDragEnd', () => {
	const orderedIds = ['a', 'b', 'c'];

	describe('transaction mode — allowed pairs (forward)', () => {
		it.each([
			['income', 'account'],
			['account', 'category'],
			['account', 'account'],
			['account', 'saving'],
			['category', 'account'],
			['saving', 'account'],
		] as const)('%s → %s returns transaction', (sourceType, targetType) => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType,
					targetType,
					targetId: 'target-1',
					orderedIds,
				})
			).toEqual({ kind: 'transaction', targetId: 'target-1' });
		});
	});

	describe('transaction mode — allowed pairs (reverse / refund)', () => {
		it('account → income returns transaction (reverse of income→account)', () => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType: 'account',
					targetType: 'income',
					targetId: 'inc-1',
					orderedIds,
				})
			).toEqual({ kind: 'transaction', targetId: 'inc-1' });
		});
	});

	describe('transaction mode — blocked pairs', () => {
		it.each([
			['income', 'income'],
			['income', 'category'],
			['income', 'saving'],
			['category', 'category'],
			['category', 'saving'],
			['saving', 'saving'],
			['saving', 'income'],
			['saving', 'category'],
		] as const)('%s → %s returns none', (sourceType, targetType) => {
			expect(
				resolveGridDragEnd({
					dragBehavior: 'transaction',
					sourceType,
					targetType,
					targetId: 'target-1',
					orderedIds,
				})
			).toEqual({ kind: 'none' });
		});
	});

	describe('transaction mode — missing target', () => {
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

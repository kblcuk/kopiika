import { resolveGridDragEnd } from '../sortable-entity-grid-logic';

describe('SortableEntityGrid', () => {
	it('does not persist same-section reorder while in transaction mode', () => {
		expect(
			resolveGridDragEnd({
				dragBehavior: 'transaction',
				sourceType: 'account',
				targetType: 'account',
				targetId: null,
				orderedIds: ['acc-2', 'acc-1'],
			})
		).toEqual({ kind: 'none' });
	});

	it('reorders entities when edit mode enables reorder dragging', () => {
		expect(
			resolveGridDragEnd({
				dragBehavior: 'reorder',
				sourceType: 'account',
				targetType: null,
				targetId: null,
				orderedIds: ['acc-2', 'acc-1'],
			})
		).toEqual({ kind: 'reorder', orderedIds: ['acc-2', 'acc-1'] });
	});

	it('keeps edit-mode drags local instead of creating cross-section transactions', () => {
		expect(
			resolveGridDragEnd({
				dragBehavior: 'reorder',
				sourceType: 'account',
				targetType: 'category',
				targetId: 'cat-1',
				orderedIds: ['acc-2', 'acc-1'],
			})
		).toEqual({ kind: 'reorder', orderedIds: ['acc-2', 'acc-1'] });
	});

	it('allows account-to-account transfers in transaction mode', () => {
		expect(
			resolveGridDragEnd({
				dragBehavior: 'transaction',
				sourceType: 'account',
				targetType: 'account',
				targetId: 'acc-2',
				orderedIds: ['acc-1', 'acc-2'],
			})
		).toEqual({ kind: 'transaction', targetId: 'acc-2' });
	});

	it('allows cross-type drops to create transactions in transaction mode', () => {
		expect(
			resolveGridDragEnd({
				dragBehavior: 'transaction',
				sourceType: 'account',
				targetType: 'category',
				targetId: 'cat-1',
				orderedIds: ['acc-1', 'acc-2'],
			})
		).toEqual({ kind: 'transaction', targetId: 'cat-1' });
	});

	it('allows saving → account for explicit release', () => {
		expect(
			resolveGridDragEnd({
				dragBehavior: 'transaction',
				sourceType: 'saving',
				targetType: 'account',
				targetId: 'acc-1',
				orderedIds: ['saving-1'],
			})
		).toEqual({ kind: 'transaction', targetId: 'acc-1' });
	});
});

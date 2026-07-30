import { act, renderHook } from '@testing-library/react-native';

import { useTransactionFlow } from '@/src/hooks/use-transaction-flow';
import type { EntityType, EntityWithBalance, Transaction } from '@/src/types';

function entity(id: string, type: EntityType): EntityWithBalance {
	return {
		id,
		type,
		name: id,
		currency: 'EUR',
		icon: 'circle',
		row: 0,
		position: 0,
		actual: 0,
		planned: 0,
		remaining: 0,
		upcoming: 0,
	} as EntityWithBalance;
}

const account = entity('acc-1', 'account');
const category = entity('cat-1', 'category');

describe('useTransactionFlow', () => {
	it('starts closed and not in quickAdd', () => {
		const { result } = renderHook(() => useTransactionFlow({ allEntities: [] }));

		expect(result.current.transactionModalProps.visible).toBe(false);
		expect(result.current.transactionModalProps.quickAdd).toBe(false);
	});

	it('open() sets both endpoints and leaves quickAdd off', () => {
		const { result } = renderHook(() => useTransactionFlow({ allEntities: [] }));

		act(() => result.current.open(account, category));

		expect(result.current.transactionModalProps).toMatchObject({
			visible: true,
			quickAdd: false,
			fromEntity: account,
			toEntity: category,
		});
	});

	it('openQuickAdd() turns quickAdd on with only a destination', () => {
		const { result } = renderHook(() => useTransactionFlow({ allEntities: [] }));

		act(() => result.current.openQuickAdd({ to: category }));

		expect(result.current.transactionModalProps).toMatchObject({
			visible: true,
			quickAdd: true,
			fromEntity: null,
			toEntity: category,
		});
	});

	it('openQuickAdd() turns quickAdd on with only a source', () => {
		const { result } = renderHook(() => useTransactionFlow({ allEntities: [] }));

		act(() => result.current.openQuickAdd({ from: account }));

		expect(result.current.transactionModalProps).toMatchObject({
			visible: true,
			quickAdd: true,
			fromEntity: account,
			toEntity: null,
		});
	});

	it('closing resets quickAdd so a later drag-initiated open is full mode', () => {
		const { result } = renderHook(() => useTransactionFlow({ allEntities: [] }));

		act(() => result.current.openQuickAdd({ to: category }));
		act(() => result.current.transactionModalProps.onClose());

		expect(result.current.transactionModalProps.quickAdd).toBe(false);
		expect(result.current.transactionModalProps.visible).toBe(false);

		act(() => result.current.open(account, category));

		expect(result.current.transactionModalProps.quickAdd).toBe(false);
	});

	it('open() after openQuickAdd() clears quickAdd without an intervening close', () => {
		const { result } = renderHook(() => useTransactionFlow({ allEntities: [] }));

		act(() => result.current.openQuickAdd({ to: category }));
		act(() => result.current.open(account, category));

		expect(result.current.transactionModalProps.quickAdd).toBe(false);
	});

	it('a refund selection opens the edit modal in full mode', () => {
		const transaction = {
			id: 'txn-1',
			from_entity_id: account.id,
			to_entity_id: category.id,
			amount_minor: 500,
			currency: 'EUR',
			timestamp: 1,
		} as Transaction;

		const { result } = renderHook(() =>
			useTransactionFlow({ allEntities: [account, category] })
		);

		act(() => result.current.openQuickAdd({ to: category }));
		act(() => result.current.transactionModalProps.onClose());
		act(() => result.current.refundPickerProps.onSelect(transaction));

		expect(result.current.transactionModalProps).toMatchObject({
			visible: true,
			quickAdd: false,
			existingTransaction: transaction,
		});
	});
});

import { Alert } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';

import { useConfirmTransaction } from '../use-confirm-transaction';
import { useStore } from '@/src/store';
import type { Transaction } from '@/src/types';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const base: Transaction = {
	id: 'tx-1',
	from_entity_id: 'acc-1',
	to_entity_id: 'cat-1',
	amount_minor: 15000,
	currency: 'USD',
	timestamp: 0,
	is_confirmed: false,
};

describe('useConfirmTransaction', () => {
	let confirmTransaction: jest.Mock;
	let updateTransaction: jest.Mock;
	let materializeOccurrence: jest.Mock;

	beforeEach(() => {
		confirmTransaction = jest.fn().mockResolvedValue(undefined);
		updateTransaction = jest.fn().mockResolvedValue(undefined);
		materializeOccurrence = jest.fn().mockResolvedValue(base);
		useStore.setState({ confirmTransaction, updateTransaction, materializeOccurrence });
		jest.spyOn(Alert, 'alert').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('confirms a due transaction directly, without a dialog or a date change', async () => {
		const { result } = renderHook(() => useConfirmTransaction());
		await act(async () => {
			await result.current({ ...base, timestamp: Date.now() });
		});

		expect(Alert.alert).not.toHaveBeenCalled();
		expect(updateTransaction).not.toHaveBeenCalled();
		expect(confirmTransaction).toHaveBeenCalledWith('tx-1');
	});

	it('asks before confirming a transaction ahead of its date', async () => {
		const { result } = renderHook(() => useConfirmTransaction());
		await act(async () => {
			await result.current({ ...base, timestamp: at(2099, 1, 1) });
		});

		expect(Alert.alert).toHaveBeenCalled();
		expect(confirmTransaction).not.toHaveBeenCalled();
	});

	it('moves the date to today when the user accepts the early confirm', async () => {
		// Pinned so the assertion below can check the exact value written, not just
		// "some number" — expect.any(Number) would also match NaN or the untouched
		// scheduled timestamp, i.e. it would still pass under a regression that
		// forgot to move the date at all.
		const FIXED_NOW = new Date(2026, 7, 3, 12, 0, 0, 0).getTime();
		jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);

		let accept: (() => void) | undefined;
		(Alert.alert as unknown as jest.Mock).mockImplementation(
			(_t: string, _m: string, buttons: { text: string; onPress?: () => void }[]) => {
				accept = buttons.find((b) => b.text === 'Confirm')?.onPress;
			}
		);

		const { result } = renderHook(() => useConfirmTransaction());
		await act(async () => {
			await result.current({ ...base, timestamp: at(2099, 1, 1) });
		});
		await act(async () => {
			accept?.();
		});

		expect(updateTransaction).toHaveBeenCalledWith('tx-1', { timestamp: FIXED_NOW });
		expect(confirmTransaction).toHaveBeenCalledWith('tx-1');
	});

	it('materializes a virtual occurrence before confirming it', async () => {
		const { result } = renderHook(() => useConfirmTransaction());
		await act(async () => {
			await result.current({ ...base, timestamp: Date.now(), isVirtual: true });
		});

		expect(materializeOccurrence).toHaveBeenCalled();
		expect(confirmTransaction).toHaveBeenCalledWith('tx-1');
	});

	it('surfaces a failure instead of dropping it silently', async () => {
		confirmTransaction.mockRejectedValue(new Error('boom'));
		jest.spyOn(console, 'error').mockImplementation(() => {});

		const { result } = renderHook(() => useConfirmTransaction());
		await act(async () => {
			await result.current({ ...base, timestamp: Date.now() });
		});

		expect(Alert.alert).toHaveBeenCalledWith(
			'Confirm failed',
			'Could not confirm this transaction. Please try again.'
		);
	});
});

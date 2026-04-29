import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { RefundPickerModal } from '../refund-picker-modal';
import { setupStoreForTest } from '@/src/test-utils-component';
import { getTransactionsBetweenEntities } from '@/src/db/transactions';
import type { EntityWithBalance, Transaction } from '@/src/types';

jest.mock('@/src/db/transactions', () => ({
	getTransactionsBetweenEntities: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('@/src/constants/icon-registry', () => {
	const { Text } = jest.requireActual('react-native');
	return {
		getIcon: () => () => <Text>Icon</Text>,
	};
});

jest.mock('lucide-react-native', () => {
	const { Text } = jest.requireActual('react-native');
	return {
		X: () => <Text>X</Text>,
	};
});

const mockedGetTxs = getTransactionsBetweenEntities as jest.Mock;

describe('RefundPickerModal', () => {
	const account: EntityWithBalance = {
		id: 'account-1',
		type: 'account',
		name: 'Main Card',
		currency: 'USD',
		order: 0,
		row: 0,
		position: 0,
		actual: 0,
		planned: 0,
		remaining: 0,
		upcoming: 0,
	};

	const category: EntityWithBalance = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		order: 0,
		row: 0,
		position: 0,
		actual: 0,
		planned: 0,
		remaining: 0,
		upcoming: 0,
	};

	const income: EntityWithBalance = {
		id: 'income-1',
		type: 'income',
		name: 'Salary',
		currency: 'USD',
		order: 0,
		row: 0,
		position: 0,
		actual: 0,
		planned: 0,
		remaining: 0,
		upcoming: 0,
	};

	const onSelect = jest.fn();
	const onClose = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		setupStoreForTest({ entities: [account, category, income] });
	});

	it('queries past transactions in the original direction (Account → Category refund)', async () => {
		mockedGetTxs.mockResolvedValue([]);

		render(
			<RefundPickerModal
				visible={true}
				originalFrom={account}
				originalTo={category}
				onSelect={onSelect}
				onClose={onClose}
			/>
		);

		await waitFor(() => {
			expect(mockedGetTxs).toHaveBeenCalledWith('account-1', 'category-1');
		});
	});

	it('queries past transactions in the original direction (Income → Account refund)', async () => {
		mockedGetTxs.mockResolvedValue([]);

		render(
			<RefundPickerModal
				visible={true}
				originalFrom={income}
				originalTo={account}
				onSelect={onSelect}
				onClose={onClose}
			/>
		);

		await waitFor(() => {
			expect(mockedGetTxs).toHaveBeenCalledWith('income-1', 'account-1');
		});
	});

	it('renders the header and direction label', async () => {
		mockedGetTxs.mockResolvedValue([]);

		const { getByText } = render(
			<RefundPickerModal
				visible={true}
				originalFrom={account}
				originalTo={category}
				onSelect={onSelect}
				onClose={onClose}
			/>
		);

		expect(getByText('Select transaction to edit')).toBeTruthy();
		await waitFor(() => {
			expect(getByText('Past transactions: Main Card → Groceries')).toBeTruthy();
		});
	});

	it('shows empty state when no past transactions exist between entities', async () => {
		mockedGetTxs.mockResolvedValue([]);

		const { getByText } = render(
			<RefundPickerModal
				visible={true}
				originalFrom={account}
				originalTo={category}
				onSelect={onSelect}
				onClose={onClose}
			/>
		);

		await waitFor(() => {
			expect(getByText('No transactions found between these entities')).toBeTruthy();
		});
	});

	it('renders a row per past transaction and calls onSelect when tapped', async () => {
		const tx: Transaction = {
			id: 'tx-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount: 55,
			currency: 'USD',
			timestamp: new Date('2026-01-15T12:00:00Z').getTime(),
		};
		mockedGetTxs.mockResolvedValue([tx]);

		const { getByTestId } = render(
			<RefundPickerModal
				visible={true}
				originalFrom={account}
				originalTo={category}
				onSelect={onSelect}
				onClose={onClose}
			/>
		);

		const row = await waitFor(() => getByTestId('refund-row-tx-1'));
		fireEvent.press(row);

		expect(onSelect).toHaveBeenCalledWith(tx);
	});

	it('calls onClose when close button is pressed', async () => {
		mockedGetTxs.mockResolvedValue([]);

		const { getByTestId } = render(
			<RefundPickerModal
				visible={true}
				originalFrom={account}
				originalTo={category}
				onSelect={onSelect}
				onClose={onClose}
			/>
		);

		fireEvent.press(getByTestId('refund-picker-close'));

		expect(onClose).toHaveBeenCalled();
	});

	it('does not query when modal is hidden', () => {
		mockedGetTxs.mockResolvedValue([]);

		render(
			<RefundPickerModal
				visible={false}
				originalFrom={account}
				originalTo={category}
				onSelect={onSelect}
				onClose={onClose}
			/>
		);

		expect(mockedGetTxs).not.toHaveBeenCalled();
	});
});

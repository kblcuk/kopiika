import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ReservationModal } from '../reservation-modal';
import { setupStoreForTest } from '@/src/test-utils-component';
import { useStore } from '@/src/store';

describe('ReservationModal', () => {
	const mockOnClose = jest.fn();

	const account = {
		id: 'account-1',
		type: 'account' as const,
		name: 'Checking',
		currency: 'EUR',
		icon: 'wallet',
		order: 0,
		row: 0,
		position: 0,
		actual: 1000,
		planned: 0,
		remaining: 1000,
		upcoming: 0,
	};

	const saving = {
		id: 'saving-1',
		type: 'saving' as const,
		name: 'Vacation',
		currency: 'EUR',
		icon: 'piggy-bank',
		order: 0,
		row: 0,
		position: 0,
		actual: 0,
		planned: 2000,
		remaining: 2000,
		upcoming: 0,
	};

	beforeEach(() => {
		setupStoreForTest();
		jest.clearAllMocks();
		useStore.setState({
			reservations: [],
		});
	});

	it('uses the shared numeric input behavior for reservation amounts', async () => {
		const { getByPlaceholderText, getByDisplayValue } = render(
			<ReservationModal
				visible={true}
				account={account}
				saving={saving}
				onClose={mockOnClose}
			/>
		);

		const amountInput = await waitFor(() => getByPlaceholderText('0'));
		expect(amountInput.props.selectTextOnFocus).toBe(true);

		fireEvent.changeText(amountInput, '05');

		expect(getByDisplayValue('5')).toBeTruthy();
	});

	it('creates a reservation for a new account-saving pair', async () => {
		const upsertReservation = jest.fn().mockResolvedValue(undefined);
		useStore.setState({ upsertReservation, reservations: [] });

		const { getByPlaceholderText, getByText } = render(
			<ReservationModal
				visible={true}
				account={account}
				saving={saving}
				onClose={mockOnClose}
			/>
		);

		fireEvent.changeText(getByPlaceholderText('0'), '250');
		fireEvent.press(getByText('Reserve'));

		await waitFor(() => {
			expect(upsertReservation).toHaveBeenCalledWith('account-1', 'saving-1', 250);
			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	it('updates an existing reservation amount', async () => {
		const upsertReservation = jest.fn().mockResolvedValue(undefined);
		useStore.setState({
			upsertReservation,
			reservations: [
				{
					id: 'reservation-1',
					account_entity_id: 'account-1',
					saving_entity_id: 'saving-1',
					amount: 300,
				},
			],
		});

		const { getByDisplayValue, getByText } = render(
			<ReservationModal
				visible={true}
				account={account}
				saving={saving}
				onClose={mockOnClose}
			/>
		);

		expect(getByText('Currently reserved: 300.00')).toBeTruthy();

		fireEvent.changeText(getByDisplayValue('300'), '450');
		fireEvent.press(getByText('Update'));

		await waitFor(() => {
			expect(upsertReservation).toHaveBeenCalledWith('account-1', 'saving-1', 450);
			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	it('clears an existing reservation from the trash action', async () => {
		const upsertReservation = jest.fn().mockResolvedValue(undefined);
		useStore.setState({
			upsertReservation,
			reservations: [
				{
					id: 'reservation-1',
					account_entity_id: 'account-1',
					saving_entity_id: 'saving-1',
					amount: 300,
				},
			],
		});

		const { getByTestId } = render(
			<ReservationModal
				visible={true}
				account={account}
				saving={saving}
				onClose={mockOnClose}
			/>
		);

		fireEvent.press(getByTestId('reservation-clear-button'));

		await waitFor(() => {
			expect(upsertReservation).toHaveBeenCalledWith('account-1', 'saving-1', 0);
			expect(mockOnClose).toHaveBeenCalled();
		});
	});
});

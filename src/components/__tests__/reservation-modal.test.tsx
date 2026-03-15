import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ReservationModal } from '../reservation-modal';
import { setupStoreForTest } from '@/src/test-utils-component';
import { useStore } from '@/src/store';

describe('ReservationModal', () => {
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
		useStore.setState({
			reservations: [
				{
					id: 'reservation-1',
					account_entity_id: 'account-1',
					saving_entity_id: 'saving-1',
					amount: 0,
				},
			],
		});
	});

	it('uses the shared numeric input behavior for reservation amounts', async () => {
		const { getByDisplayValue } = render(
			<ReservationModal
				visible={true}
				account={account}
				saving={saving}
				onClose={jest.fn()}
			/>
		);

		const amountInput = await waitFor(() => getByDisplayValue('0'));
		expect(amountInput.props.selectTextOnFocus).toBe(true);

		fireEvent.changeText(amountInput, '05');

		expect(getByDisplayValue('5')).toBeTruthy();
	});
});

import React from 'react';
import type { MutationInput } from '@/src/utils/transaction-validation';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { CreateTransactionForm } from '../create-transaction-form';
import { ReservationForm } from '../reservation-form';
import { createPracticeSession, getPracticeEntities } from '@/src/onboarding/practice-session';
const entities = getPracticeEntities(createPracticeSession('EUR'));
const income = entities.find((e) => e.type === 'income')!;
const account = entities.find((e) => e.type === 'account')!;
const saving = entities.find((e) => e.type === 'saving')!;

jest.mock('@/src/store', () => {
	throw new Error('Practice forms must not import the personal store');
});

test('transaction form submits edited minor units with visible endpoints', async () => {
	const submitted: MutationInput[] = [];
	const onClose = jest.fn();
	const ui = render(
		<CreateTransactionForm
			visible
			fromEntity={income}
			toEntity={account}
			entities={entities}
			initialAmountMinor={100000}
			timestamp={1}
			onSubmit={async (input) => {
				submitted.push(input);
			}}
			onClose={onClose}
		/>
	);
	expect(ui.getByText('Salary')).toBeTruthy();
	expect(ui.getByText('Main account')).toBeTruthy();
	fireEvent.changeText(ui.getByTestId('transaction-amount-input'), '125.50');
	fireEvent.press(ui.getByTestId('transaction-save-button'));
	await waitFor(() =>
		expect(submitted).toEqual([
			{
				from_entity_id: income.id,
				to_entity_id: account.id,
				currency: 'EUR',
				amount_minor: 12550,
			},
		])
	);
	expect(onClose).toHaveBeenCalledTimes(1);
});

test('canceling a prefilled reservation does not save; accepting adds to current reservation', async () => {
	const submitted: number[] = [];
	const close = jest.fn();
	const ui = render(
		<ReservationForm
			visible
			account={account}
			saving={saving}
			currentNetMinor={5000}
			initialAmountMinor={10000}
			onSubmit={async (n) => {
				submitted.push(n);
			}}
			onClose={close}
		/>
	);
	fireEvent.press(ui.getByTestId('reservation-cancel-button'));
	expect(submitted).toEqual([]);
	ui.rerender(
		<ReservationForm
			visible={false}
			account={account}
			saving={saving}
			currentNetMinor={5000}
			initialAmountMinor={10000}
			onSubmit={async (n) => {
				submitted.push(n);
			}}
			onClose={close}
		/>
	);
	ui.rerender(
		<ReservationForm
			visible
			account={account}
			saving={saving}
			currentNetMinor={5000}
			initialAmountMinor={10000}
			onSubmit={async (n) => {
				submitted.push(n);
			}}
			onClose={close}
		/>
	);
	fireEvent.changeText(ui.getByPlaceholderText('0'), '12');
	fireEvent.press(ui.getByTestId('reservation-submit-button'));
	await waitFor(() => expect(submitted).toEqual([6200]));
});

test('rapid saves are accepted once and rejected submissions remain retryable', async () => {
	let resolve!: () => void;
	const submitted: MutationInput[] = [];
	const submit = async (input: MutationInput) => {
		submitted.push(input);
		await new Promise<void>((r) => {
			resolve = r;
		});
	};
	const ui = render(
		<CreateTransactionForm
			visible
			fromEntity={income}
			toEntity={account}
			entities={entities}
			initialAmountMinor={100000}
			timestamp={1}
			onSubmit={submit}
			onClose={() => {}}
		/>
	);
	act(() => {
		fireEvent.press(ui.getByTestId('transaction-save-button'));
		fireEvent.press(ui.getByTestId('transaction-save-button'));
	});
	expect(submitted).toHaveLength(1);
	await act(async () => {
		resolve();
	});
});

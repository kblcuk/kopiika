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

test.each(['100÷0', '1+2+'])(
	'transaction rejects invalid expression %s and permits correction',
	async (expression) => {
		const onSubmit = jest.fn(async () => {});
		const onClose = jest.fn();
		const ui = render(
			<CreateTransactionForm
				visible
				fromEntity={income}
				toEntity={account}
				entities={entities}
				timestamp={1}
				onSubmit={onSubmit}
				onClose={onClose}
			/>
		);
		fireEvent.changeText(ui.getByTestId('transaction-amount-input'), expression);
		fireEvent.press(ui.getByTestId('transaction-save-button'));
		await waitFor(() => expect(ui.getByRole('alert')).toBeTruthy());
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		expect(ui.getByTestId('transaction-amount-input').props.value).toBe(expression);
		fireEvent.changeText(ui.getByTestId('transaction-amount-input'), '100÷2');
		fireEvent.press(ui.getByTestId('transaction-save-button'));
		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount_minor: 5000 }))
		);
	}
);

test('reservation rejects division by zero and permits correction', async () => {
	const onSubmit = jest.fn(async () => {});
	const onClose = jest.fn();
	const ui = render(
		<ReservationForm
			visible
			account={account}
			saving={saving}
			currentNetMinor={0}
			onSubmit={onSubmit}
			onClose={onClose}
		/>
	);
	fireEvent.changeText(ui.getByTestId('reservation-amount-input'), '100÷0');
	await act(async () => fireEvent.press(ui.getByTestId('reservation-submit-button')));
	expect(onSubmit).not.toHaveBeenCalled();
	expect(onClose).not.toHaveBeenCalled();
	expect(ui.getByTestId('reservation-amount-input').props.value).toBe('100÷0');
	fireEvent.changeText(ui.getByTestId('reservation-amount-input'), '100÷2');
	fireEvent.press(ui.getByTestId('reservation-submit-button'));
	await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(5000));
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

test('rapid saves are accepted once', async () => {
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

test('reservation save settling while canceled does not disable the next opening', async () => {
	let finish!: () => void;
	const amounts: number[] = [];
	const submit = async (amount: number) => {
		amounts.push(amount);
		if (amounts.length === 1)
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
	};
	const close = jest.fn();
	const props = {
		account,
		saving,
		currentNetMinor: 0,
		initialAmountMinor: 10000,
		onSubmit: submit,
		onClose: close,
	};
	const ui = render(<ReservationForm {...props} visible />);
	fireEvent.press(ui.getByTestId('reservation-submit-button'));
	fireEvent.press(ui.getByTestId('reservation-cancel-button'));
	ui.rerender(<ReservationForm {...props} visible={false} />);
	await act(async () => {
		finish();
	});
	ui.rerender(<ReservationForm {...props} visible />);
	fireEvent.press(ui.getByTestId('reservation-submit-button'));
	await waitFor(() => expect(amounts).toEqual([10000, 10000]));
});

test('an old reservation completion cannot close a sheet reopened before it settles', async () => {
	let finish!: () => void;
	const close = jest.fn();
	const props = {
		account,
		saving,
		currentNetMinor: 0,
		initialAmountMinor: 10000,
		onSubmit: () =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
		onClose: close,
	};
	const ui = render(<ReservationForm {...props} visible />);
	fireEvent.press(ui.getByTestId('reservation-submit-button'));
	fireEvent.press(ui.getByTestId('reservation-cancel-button'));
	ui.rerender(<ReservationForm {...props} visible={false} />);
	ui.rerender(<ReservationForm {...props} visible />);
	await act(async () => {
		finish();
	});
	expect(close).toHaveBeenCalledTimes(1);
});

test.each([
	['JPY', '123', 123],
	['KWD', '12.345', 12345],
] as const)(
	'%s accepts editable amounts at its own precision',
	async (currency, typed, expected) => {
		const es = getPracticeEntities(createPracticeSession(currency));
		const from = es.find((e) => e.type === 'income')!;
		const to = es.find((e) => e.type === 'account')!;
		const amounts: number[] = [];
		const ui = render(
			<CreateTransactionForm
				visible
				fromEntity={from}
				toEntity={to}
				entities={es}
				initialAmountMinor={1000}
				timestamp={1}
				onSubmit={async (input) => {
					amounts.push(input.amount_minor);
				}}
				onClose={() => {}}
			/>
		);
		fireEvent.changeText(ui.getByTestId('transaction-amount-input'), typed);
		fireEvent.press(ui.getByTestId('transaction-save-button'));
		await waitFor(() => expect(amounts).toEqual([expected]));
	}
);

test('a rejected transaction stays editable and can be saved after retry', async () => {
	let attempts = 0;
	const amounts: number[] = [];
	const close = jest.fn();
	const ui = render(
		<CreateTransactionForm
			visible
			fromEntity={income}
			toEntity={account}
			entities={entities}
			initialAmountMinor={10000}
			timestamp={1}
			onSubmit={async (input) => {
				attempts++;
				if (attempts === 1) throw new Error('Try again');
				amounts.push(input.amount_minor);
			}}
			onClose={close}
		/>
	);
	fireEvent.press(ui.getByTestId('transaction-save-button'));
	await waitFor(() => expect(ui.getByText('Try again')).toBeTruthy());
	expect(close).not.toHaveBeenCalled();
	fireEvent.changeText(ui.getByTestId('transaction-amount-input'), '111');
	fireEvent.press(ui.getByTestId('transaction-save-button'));
	await waitFor(() => expect(amounts).toEqual([11100]));
	expect(close).toHaveBeenCalledTimes(1);
});

test('a rapid edit followed by Save records the edited amount before the next render', async () => {
	const amounts: number[] = [];
	const ui = render(
		<CreateTransactionForm
			visible
			fromEntity={income}
			toEntity={account}
			entities={entities}
			initialAmountMinor={100000}
			timestamp={1}
			onSubmit={async (input) => {
				amounts.push(input.amount_minor);
			}}
			onClose={() => {}}
		/>
	);
	act(() => {
		fireEvent.changeText(ui.getByTestId('transaction-amount-input'), '125');
		fireEvent.press(ui.getByTestId('transaction-save-button'));
	});
	await waitFor(() => expect(amounts).toEqual([12500]));
});

test('a rapid reservation edit records the edited amount before the next render', async () => {
	const amounts: number[] = [];
	const ui = render(
		<ReservationForm
			visible
			account={account}
			saving={saving}
			currentNetMinor={0}
			initialAmountMinor={10000}
			onSubmit={async (amount) => {
				amounts.push(amount);
			}}
			onClose={() => {}}
		/>
	);
	act(() => {
		fireEvent.changeText(ui.getByPlaceholderText('0'), '200');
		fireEvent.press(ui.getByTestId('reservation-submit-button'));
	});
	await waitFor(() => expect(amounts).toEqual([20000]));
});

test('a rapid expression edit is resolved before Save', async () => {
	const amounts: number[] = [];
	const ui = render(
		<CreateTransactionForm
			visible
			fromEntity={income}
			toEntity={account}
			entities={entities}
			initialAmountMinor={100000}
			timestamp={1}
			onSubmit={async (input) => {
				amounts.push(input.amount_minor);
			}}
			onClose={() => {}}
		/>
	);
	act(() => {
		fireEvent.changeText(ui.getByTestId('transaction-amount-input'), '12+3');
		fireEvent.press(ui.getByTestId('transaction-save-button'));
	});
	await waitFor(() => expect(amounts).toEqual([1500]));
});

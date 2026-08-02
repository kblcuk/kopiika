import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { TransactionModal } from '../transaction-modal';
import { setupStoreForTest } from '@/src/test-utils-component';
import type { Entity, EntityWithBalance } from '@/src/types';
import { useStore } from '@/src/store';
import { formatAmount, formatAmountForInput } from '@/src/utils/format';
import { earlyConfirmPrompt } from '@/src/utils/early-confirm';

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	selectionAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
	NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

describe('TransactionModal', () => {
	const fixedNow = new Date('2026-01-15T12:00:00Z').getTime();
	const mockFromEntity: EntityWithBalance = {
		id: 'account-1',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
		actual: 1000,
		planned: 2000,
		remaining: 1000,
		upcoming: 0,
	};

	const mockToEntity: EntityWithBalance = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		row: 0,
		position: 0,
		actual: 100,
		planned: 500,
		remaining: 400,
		upcoming: 0,
	};

	const mockOnClose = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(fixedNow);
		setupStoreForTest({
			entities: [mockFromEntity, mockToEntity],
		});
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	describe('Rendering', () => {
		it('renders modal for new transaction', () => {
			const { getByText, getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			expect(getByText('New Transaction')).toBeTruthy();
			expect(getByTestId('transaction-amount-input')).toBeTruthy();
			expect(getByTestId('transaction-save-button')).toBeTruthy();
		});

		it('returns null when fromEntity is null', () => {
			const { toJSON } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			expect(toJSON()).toBeNull();
		});

		it('returns null when toEntity is null', () => {
			const { toJSON } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={null}
					onClose={mockOnClose}
				/>
			);

			expect(toJSON()).toBeNull();
		});

		it('shows Scheduled badge for future-dated transactions', () => {
			const futureTransaction = {
				id: 'txn-future',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 25000,
				currency: 'USD',
				timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
			};

			const { getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={futureTransaction}
				/>
			);

			expect(getByText('Scheduled')).toBeTruthy();
		});

		it('filters deleted entities out of quick add source selection', async () => {
			const activeIncome: Entity = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
			};
			const deletedAccount: Entity = {
				id: 'account-deleted',
				type: 'account',
				name: 'Old Checking',
				currency: 'USD',
				row: 0,
				position: 1,
				is_deleted: true,
			};

			useStore.setState({
				entities: [activeIncome, deletedAccount],
			});

			const { getByText, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// User taps From bubble to open entity picker
			fireEvent.press(getByText('From'));
			expect(getByText('Salary')).toBeTruthy();
			expect(queryByText('Old Checking')).toBeNull();
		});
	});

	describe('Recurrence UI', () => {
		it('does not render a "Generate ahead" horizon picker after enabling repeat', () => {
			const { getByTestId, queryByTestId, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Sanity: horizon picker not present before toggling repeat.
			expect(queryByText('Generate ahead')).toBeNull();

			// Enable repeat — frequency / end-mode UI should appear.
			fireEvent.press(getByTestId('repeat-toggle'));
			expect(getByTestId('repeat-freq-monthly')).toBeTruthy();
			expect(getByTestId('repeat-end-never')).toBeTruthy();

			// Horizon UI must remain absent — it is now derived automatically.
			expect(queryByText('Generate ahead')).toBeNull();
			expect(queryByTestId('repeat-horizon-30')).toBeNull();
			expect(queryByTestId('repeat-horizon-90')).toBeNull();
			expect(queryByTestId('repeat-horizon-180')).toBeNull();
			expect(queryByTestId('repeat-horizon-365')).toBeNull();
		});

		it('seeds a default end count when switching to "After N"', () => {
			const addRecurringSpy = jest.fn();
			useStore.setState({ addRecurringTransaction: addRecurringSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '20');
			fireEvent.press(getByTestId('repeat-toggle'));
			fireEvent.press(getByTestId('repeat-end-count'));

			// Visible value in the input matches what save will persist — no silent "forever".
			expect(getByTestId('repeat-end-count-input').props.value).toBe('12');

			fireEvent.press(getByTestId('transaction-save-button'));

			expect(addRecurringSpy).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({ endCount: 12, endDate: null })
			);
		});

		it('seeds a default end date when switching to "Until date"', () => {
			const addRecurringSpy = jest.fn();
			useStore.setState({ addRecurringTransaction: addRecurringSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '20');
			fireEvent.press(getByTestId('repeat-toggle'));
			fireEvent.press(getByTestId('repeat-end-until'));
			fireEvent.press(getByTestId('transaction-save-button'));

			// Default seed is selectedDate + 1 year. With fixedNow = 2026-01-15, that's
			// approximately 2027-01-15.
			const oneYearOut = new Date(fixedNow);
			oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

			expect(addRecurringSpy).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({
					endDate: oneYearOut.getTime(),
					endCount: null,
				})
			);
		});
	});

	describe('Transaction Creation', () => {
		it('does not create transaction when amount is empty', () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Try to submit without entering amount
			fireEvent.press(getByTestId('transaction-save-button'));

			expect(batchSpy).not.toHaveBeenCalled();
			expect(mockOnClose).not.toHaveBeenCalled();
		});

		it('does not create transaction when amount is zero', () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '0');
			fireEvent.press(getByTestId('transaction-save-button'));

			expect(batchSpy).not.toHaveBeenCalled();
		});

		it('does not create transaction when amount is negative', () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '-100');
			fireEvent.press(getByTestId('transaction-save-button'));

			expect(batchSpy).not.toHaveBeenCalled();
		});

		it('shows validation hint when amount is zero or negative', () => {
			const { getByTestId, getByText, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '0');
			expect(getByText('Amount must be greater than 0')).toBeTruthy();

			fireEvent.changeText(getByTestId('transaction-amount-input'), '-5');
			expect(getByText('Amount must be greater than 0')).toBeTruthy();

			fireEvent.changeText(getByTestId('transaction-amount-input'), '10');
			expect(queryByText('Amount must be greater than 0')).toBeNull();
		});

		it('creates transaction with valid amount', async () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '150');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledTimes(1);
				const batch = batchSpy.mock.calls[0][0] as unknown[];
				// No funding section → no releases; batch is exactly the main tx.
				expect(batch).toHaveLength(1);
				expect(batch[0]).toMatchObject({
					from_entity_id: 'account-1',
					to_entity_id: 'category-1',
					amount_minor: 15000,
					currency: 'USD',
				});
			});

			expect(mockOnClose).toHaveBeenCalled();
		});

		it('creates transaction with decimal amount using dot separator', async () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '1.15');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							amount_minor: 115,
						}),
					])
				);
			});
		});

		it('evaluates arithmetic expression on save (KII-44)', async () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '10+60');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							amount_minor: 7000,
						}),
					])
				);
			});
		});

		it('disables Save button and shows "Saving…" label while save is in flight', async () => {
			// Simulate a slow DB write that never resolves — button should go disabled immediately
			useStore.setState({ createTransactionBatch: jest.fn(() => new Promise(() => {})) });

			const { getByTestId, getByText, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');

			const saveButton = getByTestId('transaction-save-button');
			expect(saveButton.props.accessibilityState?.disabled).toBeFalsy();
			expect(getByText('Save')).toBeTruthy();

			fireEvent.press(saveButton);
			await act(async () => {}); // flush state → isSubmitting = true

			expect(saveButton.props.accessibilityState?.disabled).toBe(true);
			expect(getByText('Saving…')).toBeTruthy();
			expect(queryByText('Save')).toBeNull();
		});

		it('shows Alert, keeps modal open, and re-enables Save on DB error', async () => {
			const alertSpy = jest.spyOn(Alert, 'alert');
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
			useStore.setState({
				createTransactionBatch: jest.fn().mockRejectedValue(new Error('disk full')),
			});

			try {
				const { getByTestId, getByText } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);

				fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
				fireEvent.press(getByTestId('transaction-save-button'));

				await waitFor(() => expect(alertSpy).toHaveBeenCalled());

				expect(alertSpy).toHaveBeenCalledWith('Save failed', expect.any(String));
				expect(consoleErrorSpy).toHaveBeenCalledWith(
					'Failed to save transaction:',
					expect.any(Error)
				);
				// Modal stays open — onClose must NOT have been called
				expect(mockOnClose).not.toHaveBeenCalled();
				// isSubmitting reset — button re-enabled and label restored
				expect(getByText('Save')).toBeTruthy();
				expect(
					getByTestId('transaction-save-button').props.accessibilityState?.disabled
				).toBeFalsy();
			} finally {
				consoleErrorSpy.mockRestore();
			}
		});

		it('does not create duplicate transactions on rapid double-press of Save', async () => {
			let resolveFirstSave: () => void;
			const batchSpy = jest
				.fn()
				.mockImplementationOnce(
					() =>
						new Promise<void>((resolve) => {
							resolveFirstSave = resolve;
						})
				)
				.mockResolvedValue(undefined);
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');

			const saveButton = getByTestId('transaction-save-button');
			fireEvent.press(saveButton); // first press → starts async save
			await act(async () => {}); // isSubmitting = true, button disabled
			fireEvent.press(saveButton); // second press → isSubmitting guard blocks it

			resolveFirstSave!(); // resolve the first save
			await waitFor(() => expect(mockOnClose).toHaveBeenCalledTimes(1));

			// Only one batch call despite two presses
			expect(batchSpy).toHaveBeenCalledTimes(1);
		});

		it('includes note when provided', async () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
			fireEvent.changeText(getByTestId('transaction-note-input'), 'Weekly groceries');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							amount_minor: 10000,
							note: 'Weekly groceries',
						}),
					])
				);
			});
		});
	});

	describe('Suggested Amount', () => {
		it('shows suggested amount for income → account flow', () => {
			const incomeEntity: EntityWithBalance = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				// KII-120: minor units.
				actual: 50000,
				planned: 300000,
				remaining: 250000,

				upcoming: 0,
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={incomeEntity}
					toEntity={mockFromEntity}
					onClose={mockOnClose}
				/>
			);

			expect(getByTestId('transaction-suggested-amount-button')).toBeTruthy();
		});

		it('shows suggested amount for account → saving flow', () => {
			const savingEntity: EntityWithBalance = {
				id: 'saving-1',
				type: 'saving',
				name: 'Vacation',
				currency: 'USD',
				row: 0,
				position: 0,
				actual: 200,
				planned: 1000,
				remaining: 800,

				upcoming: 0,
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={savingEntity}
					onClose={mockOnClose}
				/>
			);

			expect(getByTestId('transaction-suggested-amount-button')).toBeTruthy();
		});

		it('does not show suggested amount for account → category flow', () => {
			const { queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			expect(queryByTestId('transaction-suggested-amount-button')).toBeNull();
		});

		it('populates amount when suggested button is pressed', () => {
			const incomeEntity: EntityWithBalance = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				// KII-120: minor units.
				actual: 50000,
				planned: 300000,
				remaining: 250000,

				upcoming: 0,
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={incomeEntity}
					toEntity={mockFromEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.press(getByTestId('transaction-suggested-amount-button'));

			const amountInput = getByTestId('transaction-amount-input');
			expect(amountInput.props.value).toBe('2500');
		});
	});

	describe('Edit Mode', () => {
		it('pre-fills form with existing transaction data', () => {
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 25000,
				currency: 'USD',
				timestamp: new Date('2026-01-05').getTime(),
				note: 'Existing note',
			};

			const { getByText, getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			expect(getByText('Edit Transaction')).toBeTruthy();

			const amountInput = getByTestId('transaction-amount-input');
			expect(amountInput.props.value).toBe('250');

			const noteInput = getByTestId('transaction-note-input');
			expect(noteInput.props.value).toBe('Existing note');
		});

		it('updates transaction on save in edit mode', async () => {
			const updateTransactionSpy = jest.fn();
			useStore.setState({ updateTransaction: updateTransactionSpy });

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 25000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '300');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(updateTransactionSpy).toHaveBeenCalledWith(
					'txn-1',
					expect.objectContaining({
						amount_minor: 30000,
					})
				);
			});

			expect(mockOnClose).toHaveBeenCalled();
		});

		it('rounds floating point amounts when editing', () => {
			// Simulate a transaction amount with floating point precision issues
			// This can happen when amounts are stored/retrieved from SQLite REAL columns
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 115, // Floating point precision artifact
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			const amountInput = getByTestId('transaction-amount-input');
			// Should display "1.15", not "1.1500000000091"
			expect(amountInput.props.value).toBe('1.15');
		});

		it('does not show suggested amount in edit mode', () => {
			const incomeEntity: EntityWithBalance = {
				id: 'income-1',
				type: 'income',
				name: 'Salary',
				currency: 'USD',
				row: 0,
				position: 0,
				// KII-120: minor units.
				actual: 50000,
				planned: 300000,
				remaining: 250000,

				upcoming: 0,
			};

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount_minor: 50000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={incomeEntity}
					toEntity={mockFromEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			expect(queryByTestId('transaction-suggested-amount-button')).toBeNull();
		});
	});

	describe('Split Mode', () => {
		const category2: EntityWithBalance = {
			id: 'category-2',
			type: 'category',
			name: 'Pets',
			currency: 'USD',
			row: 1,
			position: 0,
			actual: 20,
			planned: 100,
			remaining: 80,

			upcoming: 0,
		};

		let replaceSpy: jest.Mock;

		// Install the spy once for the whole describe — re-installing it in afterEach
		// causes Zustand to notify the still-mounted component before RNTL's
		// auto-cleanup runs, producing "update not wrapped in act(...)" warnings.
		beforeAll(() => {
			replaceSpy = jest.fn().mockResolvedValue(undefined);
			useStore.setState({ replaceTransactionWithSplit: replaceSpy });
		});

		beforeEach(() => {
			useStore.setState({
				entities: [mockFromEntity, mockToEntity, category2],
			});
			replaceSpy.mockClear();
		});

		afterAll(() => {
			// Restore real store action so it doesn't bleed into later describes.
			useStore.setState({ replaceTransactionWithSplit: jest.fn() });
		});

		it('shows split toggle button for new transactions', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			expect(getByTestId('split-toggle-button')).toBeTruthy();
		});

		it('shows split toggle in edit mode for account → category transactions', () => {
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 5000,
				currency: 'USD',
				timestamp: Date.now(),
			};
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);
			expect(getByTestId('split-toggle-button')).toBeTruthy();
		});

		it('edit-future with unchanged date does not include timestamp in updates (would clobber future occurrences)', async () => {
			const account2: EntityWithBalance = {
				id: 'account-2',
				type: 'account',
				name: 'Savings',
				currency: 'USD',
				row: 0,
				position: 1,
				actual: 500,
				planned: 1000,
				remaining: 500,
				upcoming: 0,
			};
			useStore.setState({ entities: [mockFromEntity, account2, mockToEntity] });

			const updateScopeSpy = jest.fn().mockResolvedValue(undefined);
			useStore.setState({ updateTransactionWithScope: updateScopeSpy });

			const existingTransaction = {
				id: 'series-tx-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: new Date('2026-01-15T12:00:00Z').getTime(),
				series_id: 'series-1',
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
					seriesScope="future"
				/>
			);

			// User changes only the from-entity, NOT the date.
			fireEvent.press(getByTestId('transaction-from-button'));
			fireEvent.press(getByTestId(`from-option-${account2.name}`));
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(updateScopeSpy).toHaveBeenCalledTimes(1);
			});
			const [, updates] = updateScopeSpy.mock.calls[0];
			// `timestamp` in a future-scope update is broadcast by SQL to every future
			// row, collapsing them onto the edited date. Only send it when changed.
			expect(updates).not.toHaveProperty('timestamp');
			expect(updates).toMatchObject({ from_entity_id: 'account-2' });
		});

		it('hides split toggle in edit mode when editing all future of a series', () => {
			const existingTransaction = {
				id: 'txn-2',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 5000,
				currency: 'USD',
				timestamp: Date.now(),
				series_id: 'series-1',
			};
			// seriesScope === 'future' means user picked "edit all future occurrences" in the
			// series scope alert. Splitting all future occurrences is incoherent — gate hides
			// the toggle.
			const { queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
					seriesScope="future"
				/>
			);
			expect(queryByTestId('split-toggle-button')).toBeNull();
		});

		it('entering split mode shows two rows and keeps split toggle visible', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));

			expect(getByTestId('split-row-0')).toBeTruthy();
			expect(getByTestId('split-row-1')).toBeTruthy();
			expect(getByTestId('split-toggle-button')).toBeTruthy();
		});

		it('anchor row (row 0) is pre-seeded with the dragged toEntity', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));
			expect(getByTestId('split-entity-0')).toBeTruthy();
		});

		it('anchor row shows auto-computed amount (total minus other splits)', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Set total before entering split mode
			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('split-toggle-button'));

			// Anchor should start at 50 (50 - 0)
			expect(getByTestId('split-anchor-amount')).toBeTruthy();

			// Fill second split with 20; anchor should drop to 30
			fireEvent.changeText(getByTestId('split-amount-1'), '20');

			// Anchor view is still present and now reflects 30
			expect(getByTestId('split-anchor-amount')).toBeTruthy();
		});

		it('anchor amount renders via formatAmount, not raw Number.toString', () => {
			// Regression: with total=100 and one split=18.3, anchor=81.7 was rendered
			// as the bare JS number string "81.7" via roundMoney().toString(), while
			// user-typed rows respect the device locale separator. The two formats
			// could appear side-by-side on the same screen (e.g. "81.7" vs "18,3").
			// Anchor must go through formatAmount so both sides agree.
			const { getByTestId, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
			fireEvent.press(getByTestId('split-toggle-button'));
			fireEvent.changeText(getByTestId('split-amount-1'), '18.3');

			// KII-120: anchor is 8170 minor (€81.70). Assert via formatAmount so
			// the test stays locale-agnostic about the decimal separator.
			expect(queryByText(formatAmount(8170, 'USD'))).toBeTruthy();
			// And NOT the raw Number.toString form that bypassed the formatter.
			expect(queryByText('81.7')).toBeNull();
		});

		it('anchor has no editable amount input', () => {
			const { getByTestId, queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));
			// split-amount-0 does not exist (anchor is read-only)
			expect(queryByTestId('split-amount-0')).toBeNull();
			// Non-anchor row 1 has an amount input
			expect(getByTestId('split-amount-1')).toBeTruthy();
		});

		it('anchor row has no remove button', () => {
			const { getByTestId, queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));
			expect(queryByTestId('split-remove-0')).toBeNull();
			expect(getByTestId('split-remove-1')).toBeTruthy();
		});

		it('use-remaining chip appears on empty non-anchor rows when total is set', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('split-toggle-button'));

			// Row 1 is empty and anchor = 50 — chip should be visible
			expect(getByTestId('split-remaining-chip-1')).toBeTruthy();
		});

		it('tapping use-remaining chip fills in that split amount', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('split-toggle-button'));

			fireEvent.press(getByTestId('split-remaining-chip-1'));

			// Row 1 amount should now be 50
			expect(getByTestId('split-amount-1').props.value).toBe('50');
		});

		it('chip fill on a non-integer anchor routes through formatAmountForInput', () => {
			// Pins the contract that the "use remaining" chip writes the locale-aware
			// helper output into the split input, not a raw JS Number.toString that
			// would emit a period regardless of locale and disagree with user-typed
			// values on comma-decimal locales. See formatAmountForInput unit tests
			// for the separator coverage.
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
			fireEvent.press(getByTestId('split-toggle-button'));
			fireEvent.changeText(getByTestId('split-amount-1'), '18.3');
			// Add a third row; its chip should now offer the remaining 81.7.
			fireEvent.press(getByTestId('split-add-button'));
			fireEvent.press(getByTestId('split-remaining-chip-2'));

			// KII-120: anchor is 8170 minor (€81.70 remaining). Production fills the
			// chip via formatAmountForInput(8170, currency).
			expect(getByTestId('split-amount-2').props.value).toBe(
				formatAmountForInput(8170, 'USD')
			);
		});

		// Interaction tests that were missing — they reproduce each symptom the
		// user reported after PR #67. The goal here is not to fix anything yet;
		// it's to nail down current behavior so we know what's pre-existing vs
		// what the formatAmountForInput sweep actually changed.
		describe('Amount input pipeline (interaction)', () => {
			it('SYMPTOM 1 — main field: typing a single comma displays as period', () => {
				const { getByTestId } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);
				const input = getByTestId('transaction-amount-input');
				fireEvent.changeText(input, ',');
				// Pre-existing: useExpressionInput.setValue runs
				// normalizeDecimalSeparator (',' → '.') before storing.
				expect(input.props.value).toBe('.');
			});

			it('SYMPTOM 1 — main field: typing "100,5" stored as "100.5"', () => {
				const { getByTestId } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);
				const input = getByTestId('transaction-amount-input');
				fireEvent.changeText(input, '100,5');
				expect(input.props.value).toBe('100.5');
			});

			it('SYMPTOM 2 — main field: blur does NOT mutate a trailing decimal', () => {
				const { getByTestId } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);
				const input = getByTestId('transaction-amount-input');
				fireEvent.changeText(input, '100.');
				fireEvent(input, 'blur');
				// onBlur in useExpressionInput only sets focused=false — there is
				// no value mutation. If this passes, the "blur removes the dot"
				// behavior is native iOS, not our JS code.
				expect(input.props.value).toBe('100.');
			});

			it('split row: typing comma is normalized to dot (symmetric with main)', () => {
				const { getByTestId } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);
				fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
				fireEvent.press(getByTestId('split-toggle-button'));
				const splitInput = getByTestId('split-amount-1');
				fireEvent.changeText(splitInput, '5,3');
				expect(splitInput.props.value).toBe('5.3');
			});

			it('split-mode main field: partial decimal "5," is preserved as "5."', () => {
				// Split mode keeps a draft string so trailing separators round-trip
				// while typing — splitTotal (number) is still updated in parallel.
				const { getByTestId } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);
				fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
				fireEvent.press(getByTestId('split-toggle-button'));
				const input = getByTestId('transaction-amount-input');
				fireEvent.changeText(input, '5,');
				expect(input.props.value).toBe('5.');
			});

			it('split-mode main field: typing "." after a whole number is preserved', () => {
				// Regression: previously the input was bound to splitTotal.toString(),
				// so "100." → parseFloat → 100 → "100" silently dropped the dot.
				const { getByTestId } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);
				fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
				fireEvent.press(getByTestId('split-toggle-button'));
				const input = getByTestId('transaction-amount-input');
				fireEvent.changeText(input, '100.');
				expect(input.props.value).toBe('100.');
				fireEvent.changeText(input, '100.5');
				expect(input.props.value).toBe('100.5');
			});

			it('split-mode main field: full "5,3" round-trips correctly', () => {
				const { getByTestId } = render(
					<TransactionModal
						visible={true}
						fromEntity={mockFromEntity}
						toEntity={mockToEntity}
						onClose={mockOnClose}
					/>
				);
				fireEvent.changeText(getByTestId('transaction-amount-input'), '100');
				fireEvent.press(getByTestId('split-toggle-button'));
				const input = getByTestId('transaction-amount-input');
				fireEvent.changeText(input, '5,3');
				// formatAmountForInput(5.3) in en-US test locale is "5.3".
				// On a comma-locale device this would render "5,3" — agreeing
				// with the user's typed input visually.
				expect(input.props.value).toBe('5.3');
			});
		});

		it('add split button creates a new row', () => {
			const { getByTestId, queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));
			expect(queryByTestId('split-row-2')).toBeNull();

			fireEvent.press(getByTestId('split-add-button'));
			expect(getByTestId('split-row-2')).toBeTruthy();
		});

		it('remove button on non-anchor rows respects minimum of 2 total rows', () => {
			const { getByTestId, queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));

			// Add a third row
			fireEvent.press(getByTestId('split-add-button'));
			expect(getByTestId('split-row-2')).toBeTruthy();

			// Remove it
			fireEvent.press(getByTestId('split-remove-2'));
			expect(queryByTestId('split-row-2')).toBeNull();

			// At 2 rows: remove on row 1 is disabled — pressing does nothing
			fireEvent.press(getByTestId('split-remove-1'));
			expect(getByTestId('split-row-0')).toBeTruthy();
			expect(getByTestId('split-row-1')).toBeTruthy();
		});

		it('saves anchor-only transaction when non-anchor split has no entity', async () => {
			const batchSpy = jest.fn();
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Set total, enter split mode, fill non-anchor amount
			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('split-toggle-button'));
			fireEvent.changeText(getByTestId('split-amount-1'), '20');
			// Row 1 has no entity selected → only anchor (Groceries, 30) saves
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledTimes(1);
				const batch = batchSpy.mock.calls[0][0] as unknown[];
				expect(batch).toHaveLength(1);
				expect(batch).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							from_entity_id: 'account-1',
							to_entity_id: 'category-1',
							amount_minor: 3000,
							currency: 'USD',
						}),
					])
				);
			});
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('saves two transactions when anchor and second split are both valid', async () => {
			const batchSpy = jest.fn();
			useStore.setState({
				createTransactionBatch: batchSpy,
				entities: [mockFromEntity, mockToEntity, category2],
			});

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('split-toggle-button'));

			// Select Pets for row 1 via entity picker
			fireEvent.press(getByTestId('split-entity-1'));
			fireEvent.press(getByText('Pets'));

			// Set row 1 amount to 20; anchor auto-computes to 30
			fireEvent.changeText(getByTestId('split-amount-1'), '20');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				// One atomic batch call containing both split rows (KII-116).
				expect(batchSpy).toHaveBeenCalledTimes(1);
				const batch = batchSpy.mock.calls[0][0] as unknown[];
				expect(batch).toHaveLength(2);
				expect(batch).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ to_entity_id: 'category-1', amount_minor: 3000 }),
						expect.objectContaining({ to_entity_id: 'category-2', amount_minor: 2000 }),
					])
				);
			});
		});

		it('does not create duplicate split transactions on rapid double-press of Save', async () => {
			// createTransactionBatch resolves immediately for all but the very first call,
			// which we hold open so the second Save press fires while save is in flight.
			let resolveFirstSave!: () => void;
			const batchSpy = jest
				.fn()
				.mockImplementationOnce(
					() =>
						new Promise<void>((resolve) => {
							resolveFirstSave = resolve;
						})
				)
				.mockResolvedValue(undefined);
			useStore.setState({
				createTransactionBatch: batchSpy,
				entities: [mockFromEntity, mockToEntity, category2],
			});

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('split-toggle-button'));

			// Give row 1 a real entity + amount so the batch contains anchor + row1
			fireEvent.press(getByTestId('split-entity-1'));
			fireEvent.press(getByText('Pets'));
			fireEvent.changeText(getByTestId('split-amount-1'), '20');

			const saveButton = getByTestId('transaction-save-button');
			fireEvent.press(saveButton); // first press → in-flight on the batch call
			await act(async () => {}); // isSubmitting = true, button disabled
			fireEvent.press(saveButton); // second press → guard blocks it entirely

			resolveFirstSave(); // let the first save complete
			await waitFor(() => expect(mockOnClose).toHaveBeenCalledTimes(1));

			// Exactly one batch call (containing 2 rows), not two batch calls (4 rows)
			// which a double-save without the in-flight guard would produce.
			expect(batchSpy).toHaveBeenCalledTimes(1);
			expect((batchSpy.mock.calls[0][0] as unknown[]).length).toBe(2);
		});

		it('toggling split off exits split mode and restores original amount', () => {
			const { getByTestId, queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('split-toggle-button'));
			expect(getByTestId('split-row-0')).toBeTruthy();

			// Toggle split off (same button)
			fireEvent.press(getByTestId('split-toggle-button'));

			expect(queryByTestId('split-row-0')).toBeNull();
			expect(getByTestId('split-toggle-button')).toBeTruthy();
			expect(getByTestId('transaction-amount-input').props.value).toBe('50');
		});

		it('header stays "New Transaction" in split mode (split is an inline section)', () => {
			const { getByText, getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));
			expect(getByText('New Transaction')).toBeTruthy();
			// Split toggle stays visible as a toggle (no separate merge button)
			expect(getByTestId('split-toggle-button')).toBeTruthy();
		});

		it('resets split mode when modal is closed and reopened', () => {
			const { getByTestId, queryByTestId, rerender } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.press(getByTestId('split-toggle-button'));
			expect(queryByTestId('split-row-0')).toBeTruthy();

			rerender(
				<TransactionModal
					visible={false}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);
			rerender(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			expect(queryByTestId('split-row-0')).toBeNull();
			expect(getByTestId('split-toggle-button')).toBeTruthy();
		});

		it('seeds anchor row with original to_entity when splitting an existing transaction', () => {
			const existingTransaction = {
				id: 'txn-pre',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 5000,
				currency: 'USD',
				timestamp: Date.now(),
			};
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);
			fireEvent.press(getByTestId('split-toggle-button'));
			// Anchor row chip should render the entity name from the original transaction.
			expect(getByTestId('split-row-0')).toBeTruthy();
			expect(getByTestId('split-entity-0')).toHaveTextContent(mockToEntity.name);
		});

		it('save in edit+split mode calls replaceTransactionWithSplit with the original id', async () => {
			const existingTransaction = {
				id: 'txn-save',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 5000,
				currency: 'USD',
				timestamp: fixedNow,
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			fireEvent.press(getByTestId('split-toggle-button'));
			// Fill the non-anchor split row 1: pick the second category, type 20.
			fireEvent.press(getByTestId('split-entity-1'));
			// EntitySelectionSheet emits testIDs as `entity-option-${entity.name}` by default
			// (no testIDPrefix passed by the split picker — see entity-selection-sheet.tsx:82
			// and transaction-modal.tsx where the split picker is rendered).
			fireEvent.press(getByTestId(`entity-option-${category2.name}`));
			fireEvent.changeText(getByTestId('split-amount-1'), '20');

			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(replaceSpy).toHaveBeenCalledTimes(1);
			});
			expect(replaceSpy.mock.calls[0][0]).toBe('txn-save');
			const passedRows = replaceSpy.mock.calls[0][1] as {
				amount_minor: number;
				to_entity_id: string;
			}[];
			// Anchor (3000 = 5000 - 2000) + non-anchor (2000)
			expect(passedRows).toHaveLength(2);
			const amounts = passedRows.map((r) => r.amount_minor).sort((a, b) => a - b);
			expect(amounts).toEqual([2000, 3000]);
		});
	});

	describe('Delete Button', () => {
		it('shows delete button in edit mode', () => {
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			expect(getByTestId('transaction-delete-button')).toBeTruthy();
		});

		it('does not show delete button in create mode', () => {
			const { queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			expect(queryByTestId('transaction-delete-button')).toBeNull();
		});

		it('shows confirmation alert on delete press', () => {
			const alertSpy = jest.spyOn(Alert, 'alert');
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			fireEvent.press(getByTestId('transaction-delete-button'));

			expect(alertSpy).toHaveBeenCalledWith(
				'Delete Transaction',
				'Are you sure you want to delete this transaction?',
				expect.arrayContaining([
					expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
					expect.objectContaining({ text: 'Delete', style: 'destructive' }),
				])
			);
		});

		it('deletes transaction and closes modal on confirm', () => {
			const deleteTransactionSpy = jest.fn().mockResolvedValue(undefined);
			useStore.setState({ deleteTransaction: deleteTransactionSpy });
			const alertSpy = jest.spyOn(Alert, 'alert');

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			fireEvent.press(getByTestId('transaction-delete-button'));

			// Simulate pressing "Delete" in the alert
			const destructiveButton = alertSpy.mock.calls[0]![2]?.find(
				(btn: AlertButton) => btn.style === 'destructive'
			);
			destructiveButton?.onPress?.();

			expect(deleteTransactionSpy).toHaveBeenCalledWith('txn-1');
			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	// The scope ("this one" / "all future") is chosen once, when the occurrence is
	// opened for editing, and arrives here as `seriesScope`. Deleting must reuse it
	// instead of asking again (KII-158) — but still confirm, since delete is
	// destructive.
	describe('Delete Button — recurring occurrence', () => {
		const seriesTransaction = {
			id: 'txn-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 10000,
			currency: 'USD',
			timestamp: fixedNow,
			series_id: 'series-1',
		};

		const renderAndPressDelete = (props: {
			existingTransaction: typeof seriesTransaction & { isVirtual?: boolean };
			seriesScope?: 'single' | 'future';
		}) => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					{...props}
				/>
			);
			fireEvent.press(getByTestId('transaction-delete-button'));
		};

		const pressDestructive = (alertSpy: jest.SpyInstance) => {
			const buttons = alertSpy.mock.calls[0]![2] as AlertButton[] | undefined;
			buttons?.find((btn) => btn.style === 'destructive')?.onPress?.();
		};

		let deleteTransactionWithScope: jest.Mock;
		let excludeOccurrence: jest.Mock;
		let materializeOccurrence: jest.Mock;

		beforeEach(() => {
			deleteTransactionWithScope = jest.fn().mockResolvedValue(undefined);
			excludeOccurrence = jest.fn().mockResolvedValue(undefined);
			materializeOccurrence = jest.fn().mockResolvedValue(undefined);
			useStore.setState({
				deleteTransactionWithScope,
				excludeOccurrence,
				materializeOccurrence,
			});
		});

		it('confirms without re-asking for scope when scope is already known', () => {
			const alertSpy = jest.spyOn(Alert, 'alert');

			renderAndPressDelete({
				existingTransaction: seriesTransaction,
				seriesScope: 'single',
			});

			expect(alertSpy).toHaveBeenCalledWith(
				'Delete Recurring Transaction',
				'Delete this occurrence only?',
				[
					expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
					expect.objectContaining({ text: 'Delete', style: 'destructive' }),
				]
			);

			pressDestructive(alertSpy);

			expect(deleteTransactionWithScope).toHaveBeenCalledWith('txn-1', 'single');
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('deletes the rest of the series when the chosen scope is "future"', () => {
			const alertSpy = jest.spyOn(Alert, 'alert');

			renderAndPressDelete({
				existingTransaction: seriesTransaction,
				seriesScope: 'future',
			});

			expect(alertSpy).toHaveBeenCalledWith(
				'Delete Recurring Transaction',
				'Delete this and all future occurrences?',
				expect.any(Array)
			);

			pressDestructive(alertSpy);

			expect(deleteTransactionWithScope).toHaveBeenCalledWith('txn-1', 'future');
		});

		it('records an exclusion for a virtual occurrence deleted with scope "single"', async () => {
			const alertSpy = jest.spyOn(Alert, 'alert');
			const virtualOccurrence = { ...seriesTransaction, isVirtual: true };

			renderAndPressDelete({
				existingTransaction: virtualOccurrence,
				seriesScope: 'single',
			});
			pressDestructive(alertSpy);

			await waitFor(() =>
				expect(excludeOccurrence).toHaveBeenCalledWith(
					expect.objectContaining({ id: 'txn-1', isVirtual: true })
				)
			);
			expect(deleteTransactionWithScope).not.toHaveBeenCalled();
			expect(materializeOccurrence).not.toHaveBeenCalled();
		});

		// Future-scope deletes are id-based, so a virtual occurrence needs a real
		// row before the delete runs. Holding materializeOccurrence pending pins
		// that the delete actually *waits* — asserting call order alone still
		// passes if the await is dropped.
		it('materializes a virtual occurrence before deleting the rest of the series', async () => {
			const alertSpy = jest.spyOn(Alert, 'alert');
			let finishMaterialize!: () => void;
			materializeOccurrence.mockReturnValue(
				new Promise<void>((resolve) => {
					finishMaterialize = resolve;
				})
			);

			renderAndPressDelete({
				existingTransaction: { ...seriesTransaction, isVirtual: true },
				seriesScope: 'future',
			});
			pressDestructive(alertSpy);

			await act(async () => {});
			expect(materializeOccurrence).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'txn-1', isVirtual: true })
			);
			expect(deleteTransactionWithScope).not.toHaveBeenCalled();

			finishMaterialize();

			await waitFor(() =>
				expect(deleteTransactionWithScope).toHaveBeenCalledWith('txn-1', 'future')
			);
			expect(excludeOccurrence).not.toHaveBeenCalled();
		});

		// The confirm exists precisely so the user can back out of a destructive
		// action — Cancel must touch neither the store nor the modal.
		it('deletes nothing when the confirmation is cancelled', () => {
			const alertSpy = jest.spyOn(Alert, 'alert');

			renderAndPressDelete({
				existingTransaction: seriesTransaction,
				seriesScope: 'future',
			});

			const buttons = alertSpy.mock.calls[0]![2] as AlertButton[] | undefined;
			const cancelButton = buttons?.find((btn) => btn.style === 'cancel');
			expect(cancelButton).toBeTruthy();
			cancelButton?.onPress?.();

			expect(deleteTransactionWithScope).not.toHaveBeenCalled();
			expect(excludeOccurrence).not.toHaveBeenCalled();
			expect(materializeOccurrence).not.toHaveBeenCalled();
			expect(mockOnClose).not.toHaveBeenCalled();
		});

		it('still asks for scope when none was chosen up front', () => {
			const alertSpy = jest.spyOn(Alert, 'alert');

			renderAndPressDelete({ existingTransaction: seriesTransaction });

			const buttons = alertSpy.mock.calls[0]![2] as AlertButton[] | undefined;
			expect(buttons?.map((btn) => btn.text)).toEqual([
				'Cancel',
				'This one only',
				'All future',
			]);

			// The scope picked here must still reach the delete.
			buttons?.find((btn) => btn.text === 'All future')?.onPress?.();

			expect(deleteTransactionWithScope).toHaveBeenCalledWith('txn-1', 'future');
		});
	});

	// The button routes through the same useConfirmTransaction flow as the
	// History row's Confirm pill (KII-159); it must not duplicate that logic.
	describe('Confirm Now (KII-159)', () => {
		const baseTransaction = {
			id: 'txn-confirm-1',
			from_entity_id: 'account-1',
			to_entity_id: 'category-1',
			amount_minor: 10000,
			currency: 'USD',
			timestamp: fixedNow,
		};

		const renderModal = (props: Partial<React.ComponentProps<typeof TransactionModal>> = {}) =>
			render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={baseTransaction}
					{...props}
				/>
			);

		it('offers Confirm now when editing an unconfirmed transaction (KII-159)', () => {
			const { getByTestId } = renderModal({
				existingTransaction: {
					...baseTransaction,
					is_confirmed: false,
					timestamp: Date.now() + 5 * 24 * 60 * 60 * 1000,
				},
			});

			expect(getByTestId('transaction-confirm-now-button')).toBeTruthy();
		});

		it('hides Confirm now for an already-confirmed transaction', () => {
			const { queryByTestId } = renderModal({
				existingTransaction: { ...baseTransaction, is_confirmed: true },
			});

			expect(queryByTestId('transaction-confirm-now-button')).toBeNull();
		});

		it('closes the modal and confirms the exact transaction when it is already due', () => {
			// baseTransaction.timestamp === fixedNow, so this fixture is due today —
			// the hook takes its no-dialog path straight to confirmTransaction. Route
			// the store call through a resolved spy (the mocked SQLite layer throws
			// for unconfigured queries) and assert the flow reaches it with the
			// right id — the ordering alone doesn't prove the wiring (KII-159).
			const onClose = jest.fn();
			const confirmTransactionSpy = jest.fn().mockResolvedValue(undefined);
			const alertSpy = jest.spyOn(Alert, 'alert');
			useStore.setState({ confirmTransaction: confirmTransactionSpy });
			const { getByTestId } = renderModal({
				onClose,
				existingTransaction: { ...baseTransaction, is_confirmed: false },
			});

			fireEvent.press(getByTestId('transaction-confirm-now-button'));

			expect(onClose).toHaveBeenCalled();
			expect(alertSpy).not.toHaveBeenCalled();
			expect(confirmTransactionSpy).toHaveBeenCalledWith('txn-confirm-1');
		});

		it('shows the early-confirm dialog instead of confirming immediately when ahead of schedule', () => {
			const confirmTransactionSpy = jest.fn().mockResolvedValue(undefined);
			const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
			useStore.setState({ confirmTransaction: confirmTransactionSpy });

			const aheadTimestamp = fixedNow + 5 * 24 * 60 * 60 * 1000;
			// Computed the same way the hook computes it, so this assertion is
			// pinned to the exact dialog copy rather than a hand-typed guess.
			const prompt = earlyConfirmPrompt(aheadTimestamp, fixedNow);
			if (!prompt) throw new Error('fixture must be ahead of its scheduled day');

			const { getByTestId } = renderModal({
				existingTransaction: {
					...baseTransaction,
					is_confirmed: false,
					timestamp: aheadTimestamp,
				},
			});

			fireEvent.press(getByTestId('transaction-confirm-now-button'));

			expect(alertSpy).toHaveBeenCalledWith(
				'Confirm early?',
				`Scheduled for ${prompt.scheduledLabel}. Record it as today, ${prompt.todayLabel}?`,
				expect.arrayContaining([
					expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
					expect.objectContaining({ text: 'Confirm' }),
				])
			);
			// The dialog gates the write — accepting it is a separate user action,
			// already covered by use-confirm-transaction.test.tsx.
			expect(confirmTransactionSpy).not.toHaveBeenCalled();
		});
	});

	describe('Cancel Button', () => {
		it('calls onClose when cancel is pressed', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.press(getByTestId('transaction-cancel-button'));

			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	describe('Entity Editing', () => {
		// Additional entities for testing entity changes
		const account2: Entity = {
			id: 'account-2',
			type: 'account',
			name: 'Savings',
			currency: 'USD',
			row: 1,
			position: 1,
		};

		const category2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Transport',
			currency: 'USD',
			row: 2,
			position: 1,
		};

		const incomeEntity: Entity = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'USD',
			row: 0,
			position: 0,
		};

		beforeEach(() => {
			// Set up store with multiple entities for selection
			useStore.setState({
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});
		});

		it('displays entity names in edit mode', () => {
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			expect(getByText('Checking')).toBeTruthy();
			expect(getByText('Groceries')).toBeTruthy();
		});

		it('opens from entity selection sheet when tapping from bubble in edit mode', () => {
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			// Tap on the from entity bubble (Checking)
			fireEvent.press(getByText('Checking'));

			// Selection sheet should open with "Select Source" title
			expect(getByText('Select Source')).toBeTruthy();
		});

		it('opens to entity selection sheet when tapping to bubble in edit mode', () => {
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			// Tap on the to entity bubble (Groceries)
			fireEvent.press(getByText('Groceries'));

			// Selection sheet should open with "Select Destination" title
			expect(getByText('Select Destination')).toBeTruthy();
		});

		it('updates transaction with new from_entity_id when changed', async () => {
			const updateTransactionSpy = jest.fn();
			useStore.setState({
				updateTransaction: updateTransactionSpy,
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByText, getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			// Open from selection sheet
			fireEvent.press(getByText('Checking'));

			// Select a different account (Savings)
			fireEvent.press(getByText('Savings'));

			// Save the transaction
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(updateTransactionSpy).toHaveBeenCalledWith(
					'txn-1',
					expect.objectContaining({
						from_entity_id: 'account-2',
					})
				);
			});
		});

		it('updates transaction with new to_entity_id when changed', async () => {
			const updateTransactionSpy = jest.fn();
			useStore.setState({
				updateTransaction: updateTransactionSpy,
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByText, getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			// Open to selection sheet
			fireEvent.press(getByText('Groceries'));

			// Select a different category (Transport)
			fireEvent.press(getByText('Transport'));

			// Save the transaction
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(updateTransactionSpy).toHaveBeenCalledWith(
					'txn-1',
					expect.objectContaining({
						to_entity_id: 'category-2',
					})
				);
			});
		});

		it('does not include entity IDs in update when unchanged', async () => {
			const updateTransactionSpy = jest.fn();
			useStore.setState({
				updateTransaction: updateTransactionSpy,
				entities: [mockFromEntity, mockToEntity, account2, category2],
			});

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			// Just change the amount, don't change entities
			fireEvent.changeText(getByTestId('transaction-amount-input'), '200');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(updateTransactionSpy).toHaveBeenCalledWith(
					'txn-1',
					expect.objectContaining({
						amount_minor: 20000,
					})
				);
			});

			// Should NOT include from_entity_id or to_entity_id since they weren't changed
			const callArgs = updateTransactionSpy.mock.calls[0][1];
			expect(callArgs.from_entity_id).toBeUndefined();
			expect(callArgs.to_entity_id).toBeUndefined();
		});

		it('entity bubbles are tappable in new transaction mode (KII-80)', () => {
			useStore.setState({
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const { getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Tap on the from entity bubble
			fireEvent.press(getByText('Checking'));

			// Selection sheet should open
			expect(getByText('Select Source')).toBeTruthy();
		});

		it('saves DnD transaction with changed From entity (KII-80)', async () => {
			const batchSpy = jest.fn();
			useStore.setState({
				createTransactionBatch: batchSpy,
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const { getByText, getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Change From from Checking to Savings
			fireEvent.press(getByText('Checking'));
			fireEvent.press(getByText('Savings'));

			fireEvent.changeText(getByTestId('transaction-amount-input'), '50');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							from_entity_id: 'account-2',
							to_entity_id: 'category-1',
							amount_minor: 5000,
						}),
					])
				);
			});
		});

		it('saves DnD transaction with changed To entity (KII-80)', async () => {
			const batchSpy = jest.fn();
			useStore.setState({
				createTransactionBatch: batchSpy,
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const { getByText, getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Change To from Groceries to Transport
			fireEvent.press(getByText('Groceries'));
			fireEvent.press(getByText('Transport'));

			fireEvent.changeText(getByTestId('transaction-amount-input'), '75');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							from_entity_id: 'account-1',
							to_entity_id: 'category-2',
							amount_minor: 7500,
						}),
					])
				);
			});
		});

		it('shows only valid entity options in from selection sheet', () => {
			useStore.setState({
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByText, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			// Open from selection sheet
			fireEvent.press(getByText('Checking'));

			// Should show accounts (valid: account -> category)
			expect(getByText('Savings')).toBeTruthy();

			// Should NOT show income (invalid: income -> category)
			// Note: Income entities shouldn't appear because income can only go to accounts
			expect(queryByText('Salary')).toBeNull();

			// Should NOT show categories (invalid: category -> category)
			expect(queryByText('Transport')).toBeNull();
		});

		it('shows only valid entity options in to selection sheet', () => {
			useStore.setState({
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount_minor: 10000,
				currency: 'USD',
				timestamp: Date.now(),
			};

			const { getByText, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);

			// Open to selection sheet
			fireEvent.press(getByText('Groceries'));

			// Should show other categories (valid: account -> category)
			expect(getByText('Transport')).toBeTruthy();

			// Should show accounts (valid: account -> account)
			expect(getByText('Savings')).toBeTruthy();

			// Should NOT show income (invalid: account -> income)
			expect(queryByText('Salary')).toBeNull();
		});
	});

	describe('Quick Add Full Flow', () => {
		const incomeEntity: Entity = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const accountEntity: Entity = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const categoryEntity: Entity = {
			id: 'category-1',
			type: 'category',
			name: 'Groceries',
			currency: 'USD',
			row: 0,
			position: 0,
		};

		it('creates income→account transaction via quickAdd', async () => {
			const batchSpy = jest.fn();
			useStore.setState({
				entities: [incomeEntity, accountEntity, categoryEntity],
				createTransactionBatch: batchSpy,
			});

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// User taps From bubble to open entity picker
			fireEvent.press(getByText('From'));
			fireEvent.press(getByText('Salary'));

			// To-entity picker auto-opens
			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Checking'));

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.changeText(getByTestId('transaction-amount-input'), '500');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							from_entity_id: 'income-1',
							to_entity_id: 'account-1',
							amount_minor: 50000,
							currency: 'USD',
						}),
					])
				);
			});
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('creates account→category transaction via quickAdd', async () => {
			const batchSpy = jest.fn();
			useStore.setState({
				entities: [incomeEntity, accountEntity, categoryEntity],
				createTransactionBatch: batchSpy,
			});

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// User taps From bubble to open entity picker
			fireEvent.press(getByText('From'));
			fireEvent.press(getByText('Checking'));

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Groceries'));

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.changeText(getByTestId('transaction-amount-input'), '42.50');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							from_entity_id: 'account-1',
							to_entity_id: 'category-1',
							amount_minor: 4250,
						}),
					])
				);
			});
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('resets state when visible toggles off and back on', async () => {
			useStore.setState({
				entities: [incomeEntity, accountEntity, categoryEntity],
				addTransaction: jest.fn(),
			});

			const { getByTestId, getByText, queryByText, rerender } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// Complete first flow: pick entities + type amount
			fireEvent.press(getByText('From'));
			fireEvent.press(getByText('Salary'));
			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Checking'));
			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.changeText(getByTestId('transaction-amount-input'), '100');

			// Simulate tab blur: visible → false
			rerender(
				<TransactionModal
					visible={false}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// Simulate tab focus: visible → true (should reset state)
			rerender(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// Amount should be cleared
			const amountInput = getByTestId('transaction-amount-input');
			expect(amountInput.props.value).toBe('');

			// From/To placeholders should be visible, picker should NOT auto-open
			expect(getByText('From')).toBeTruthy();
			expect(getByText('To')).toBeTruthy();
			await act(async () => jest.advanceTimersByTime(400));
			expect(queryByText('Salary')).toBeNull();
		});
	});

	describe('Default Account Pre-fill (KII-35)', () => {
		const incomeEntity: Entity = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'USD',
			row: 0,
			position: 0,
		};
		const defaultAccount: Entity = {
			id: 'account-default',
			type: 'account',
			name: 'Main Card',
			currency: 'USD',
			row: 0,
			position: 0,
			is_default: true,
		};
		const otherAccount: Entity = {
			id: 'account-other',
			type: 'account',
			name: 'Savings',
			currency: 'USD',
			row: 0,
			position: 1,
		};
		const categoryEntity: Entity = {
			id: 'category-1',
			type: 'category',
			name: 'Groceries',
			currency: 'USD',
			row: 0,
			position: 0,
		};

		it('pre-selects the default account as From in quickAdd mode', () => {
			useStore.setState({
				entities: [incomeEntity, defaultAccount, otherAccount, categoryEntity],
			});

			const { getByText, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// Default account name should be visible as the From entity
			expect(getByText('Main Card')).toBeTruthy();
			// "From" placeholder should NOT be visible (entity is pre-selected)
			expect(queryByText('From')).toBeNull();
		});

		it('does not pre-select a deleted default account', () => {
			useStore.setState({
				entities: [{ ...defaultAccount, is_deleted: true }, otherAccount, categoryEntity],
			});

			const { getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// Should show empty "From" placeholder
			expect(getByText('From')).toBeTruthy();
		});

		it('shows empty From when no default account exists', () => {
			useStore.setState({
				entities: [incomeEntity, otherAccount, categoryEntity],
			});

			const { getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			expect(getByText('From')).toBeTruthy();
		});

		it('allows overriding the pre-selected default account', async () => {
			const batchSpy = jest.fn();
			useStore.setState({
				entities: [incomeEntity, defaultAccount, otherAccount, categoryEntity],
				createTransactionBatch: batchSpy,
			});

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// Pre-selected, user taps to change
			fireEvent.press(getByText('Main Card'));
			fireEvent.press(getByText('Savings'));

			// Pick destination
			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Groceries'));

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.changeText(getByTestId('transaction-amount-input'), '25');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							from_entity_id: 'account-other',
							to_entity_id: 'category-1',
							amount_minor: 2500,
						}),
					])
				);
			});
		});
	});

	describe('Savings Funding (KII-71)', () => {
		const savingEntity: Entity = {
			id: 'saving-1',
			type: 'saving',
			name: 'Cats savings',
			currency: 'USD',
			row: 0,
			position: 0,
		};

		beforeEach(() => {
			setupStoreForTest({
				entities: [mockFromEntity, mockToEntity, savingEntity],
			});
			// Simulate existing reservation via account→saving transaction
			useStore.setState({
				transactions: [
					{
						id: 'tx-res-1',
						from_entity_id: 'account-1',
						to_entity_id: 'saving-1',
						amount_minor: 30000,
						currency: 'USD',
						timestamp: Date.now(),
					},
				],
			});
		});

		it('transaction amount equals entered amount, not entered + funded', async () => {
			const batchSpy = jest.fn().mockResolvedValue(undefined);
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '10');
			fireEvent.press(getByText('Cats savings'));
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				// Main transaction (in the same atomic batch as the release) is exactly
				// what was typed — release does NOT inflate it.
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							amount_minor: 1000,
							from_entity_id: 'account-1',
						}),
					])
				);
			});
		});

		it('creates saving→account release transaction for funded amount', async () => {
			const batchSpy = jest.fn().mockResolvedValue(undefined);
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '10');
			fireEvent.press(getByText('Cats savings'));
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				// Release sits in the same atomic batch as the main tx (KII-116).
				expect(batchSpy).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({
							from_entity_id: 'saving-1',
							to_entity_id: 'account-1',
							amount_minor: 1000,
						}),
					])
				);
			});
		});

		it('caps funded amount at reservation max when entered exceeds it', async () => {
			const batchSpy = jest.fn().mockResolvedValue(undefined);
			useStore.setState({ createTransactionBatch: batchSpy });

			const { getByTestId, getByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Amount exceeds reservation (400 > 300)
			fireEvent.changeText(getByTestId('transaction-amount-input'), '400');
			fireEvent.press(getByText('Cats savings'));
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				// Main tx amount = typed; release capped at max reservation. Both rows
				// land in the same atomic batch — either both persist or neither does.
				expect(batchSpy).toHaveBeenCalledTimes(1);
				const batch = batchSpy.mock.calls[0][0] as unknown[];
				expect(batch).toHaveLength(2);
				expect(batch).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ amount_minor: 40000 }),
						expect.objectContaining({
							from_entity_id: 'saving-1',
							to_entity_id: 'account-1',
							amount_minor: 30000,
						}),
					])
				);
			});
		});

		it('does not render savings section between amount and date', () => {
			const { queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Section should exist (account has reservations)
			expect(queryByText('Fund from savings')).toBeTruthy();
		});
	});

	describe('amount sanitization (USD entity)', () => {
		it('typing "24.24.24" yields "24.24"', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '24.24.24');
			expect(input.props.value).toBe('24.24');
		});

		it('typing "24,24.24" yields "24.24"', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '24,24.24');
			expect(input.props.value).toBe('24.24');
		});

		it('typing "24.4204300034" yields "24.42"', () => {
			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			const input = getByTestId('transaction-amount-input');
			fireEvent.changeText(input, '24.4204300034');
			expect(input.props.value).toBe('24.42');
		});
	});
});

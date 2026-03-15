import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { TransactionModal } from '../transaction-modal';
import { setupStoreForTest } from '@/src/test-utils-component';
import type { Entity, EntityWithBalance } from '@/src/types';
import { useStore } from '@/src/store';

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
		order: 0,
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
		order: 0,
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
		setupStoreForTest();
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
				amount: 250,
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
				order: 0,
				row: 0,
				position: 0,
			};
			const deletedAccount: Entity = {
				id: 'account-deleted',
				type: 'account',
				name: 'Old Checking',
				currency: 'USD',
				order: 1,
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

			await waitFor(() => {
				jest.advanceTimersByTime(400);
				expect(getByText('Salary')).toBeTruthy();
				expect(queryByText('Old Checking')).toBeNull();
			});
		});
	});

	describe('Transaction Creation', () => {
		it('does not create transaction when amount is empty', () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

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

			expect(addTransactionSpy).not.toHaveBeenCalled();
			expect(mockOnClose).not.toHaveBeenCalled();
		});

		it('does not create transaction when amount is zero', () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

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

			expect(addTransactionSpy).not.toHaveBeenCalled();
		});

		it('does not create transaction when amount is negative', () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

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

			expect(addTransactionSpy).not.toHaveBeenCalled();
		});

		it('creates transaction with valid amount', async () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

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
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: 'account-1',
						to_entity_id: 'category-1',
						amount: 150,
						currency: 'USD',
					})
				);
			});

			expect(mockOnClose).toHaveBeenCalled();
		});

		it('creates transaction with decimal amount using dot separator', async () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

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
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						amount: 1.15,
					})
				);
			});
		});

		it('creates transaction with decimal amount using comma separator', async () => {
			// This tests the European locale input format where comma is decimal separator
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

			const { getByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('transaction-amount-input'), '1,15');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						amount: 1.15,
					})
				);
			});
		});

		it('includes note when provided', async () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

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
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						amount: 100,
						note: 'Weekly groceries',
					})
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
				order: 0,
				row: 0,
				position: 0,
				actual: 500,
				planned: 3000,
				remaining: 2500,

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
				order: 0,
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
				order: 0,
				row: 0,
				position: 0,
				actual: 500,
				planned: 3000,
				remaining: 2500,

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
				amount: 250,
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
				amount: 250,
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
						amount: 300,
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
				amount: 1.1500000000091, // Floating point precision artifact
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
				order: 0,
				row: 0,
				position: 0,
				actual: 500,
				planned: 3000,
				remaining: 2500,

				upcoming: 0,
			};

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'income-1',
				to_entity_id: 'account-1',
				amount: 500,
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
			order: 1,
			row: 1,
			position: 0,
			actual: 20,
			planned: 100,
			remaining: 80,

			upcoming: 0,
		};

		beforeEach(() => {
			useStore.setState({
				entities: [mockFromEntity, mockToEntity, category2],
			});
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

		it('does not show split toggle in edit mode', () => {
			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 50,
				currency: 'USD',
				timestamp: Date.now(),
			};
			const { queryByTestId } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
					existingTransaction={existingTransaction}
				/>
			);
			expect(queryByTestId('split-toggle-button')).toBeNull();
		});

		it('entering split mode shows two rows and hides split toggle button', () => {
			const { getByTestId, queryByTestId } = render(
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
			expect(queryByTestId('split-toggle-button')).toBeNull();
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
			const addTransactionSpy = jest.fn();
			useStore.setState({ addTransaction: addTransactionSpy });

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
				expect(addTransactionSpy).toHaveBeenCalledTimes(1);
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: 'account-1',
						to_entity_id: 'category-1',
						amount: 30,
						currency: 'USD',
					})
				);
			});
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('saves two transactions when anchor and second split are both valid', async () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({
				addTransaction: addTransactionSpy,
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
				expect(addTransactionSpy).toHaveBeenCalledTimes(2);
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({ to_entity_id: 'category-1', amount: 30 })
				);
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({ to_entity_id: 'category-2', amount: 20 })
				);
			});
		});

		it('merge button exits split mode and restores original amount', () => {
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

			fireEvent.press(getByTestId('split-merge-button'));

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
			expect(getByTestId('split-merge-button')).toBeTruthy();
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
			order: 1,
			row: 1,
			position: 1,
		};

		const category2: Entity = {
			id: 'category-2',
			type: 'category',
			name: 'Transport',
			currency: 'USD',
			order: 1,
			row: 2,
			position: 1,
		};

		const incomeEntity: Entity = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'USD',
			order: 0,
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
				amount: 100,
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
				amount: 100,
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
				amount: 100,
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
				amount: 100,
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
				amount: 100,
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
				amount: 100,
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
						amount: 200,
					})
				);
			});

			// Should NOT include from_entity_id or to_entity_id since they weren't changed
			const callArgs = updateTransactionSpy.mock.calls[0][1];
			expect(callArgs.from_entity_id).toBeUndefined();
			expect(callArgs.to_entity_id).toBeUndefined();
		});

		it('entity bubbles are not tappable in new transaction mode', () => {
			const { getByText, queryByText } = render(
				<TransactionModal
					visible={true}
					fromEntity={mockFromEntity}
					toEntity={mockToEntity}
					onClose={mockOnClose}
				/>
			);

			// Try to tap on the from entity bubble
			fireEvent.press(getByText('Checking'));

			// Selection sheet should NOT open
			expect(queryByText('Select Source')).toBeNull();
		});

		it('shows only valid entity options in from selection sheet', () => {
			useStore.setState({
				entities: [mockFromEntity, mockToEntity, account2, category2, incomeEntity],
			});

			const existingTransaction = {
				id: 'txn-1',
				from_entity_id: 'account-1',
				to_entity_id: 'category-1',
				amount: 100,
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
				amount: 100,
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
			order: 0,
			row: 0,
			position: 0,
		};
		const accountEntity: Entity = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			order: 0,
			row: 0,
			position: 0,
		};
		const categoryEntity: Entity = {
			id: 'category-1',
			type: 'category',
			name: 'Groceries',
			currency: 'USD',
			order: 0,
			row: 0,
			position: 0,
		};

		it('creates income→account transaction via quickAdd', async () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({
				entities: [incomeEntity, accountEntity, categoryEntity],
				addTransaction: addTransactionSpy,
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

			// From-entity picker auto-opens
			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Salary'));

			// To-entity picker auto-opens
			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Checking'));

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.changeText(getByTestId('transaction-amount-input'), '500');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: 'income-1',
						to_entity_id: 'account-1',
						amount: 500,
						currency: 'USD',
					})
				);
			});
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('creates account→category transaction via quickAdd', async () => {
			const addTransactionSpy = jest.fn();
			useStore.setState({
				entities: [incomeEntity, accountEntity, categoryEntity],
				addTransaction: addTransactionSpy,
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

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Checking'));

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.press(getByText('Groceries'));

			await act(async () => jest.advanceTimersByTime(400));
			fireEvent.changeText(getByTestId('transaction-amount-input'), '42.50');
			fireEvent.press(getByTestId('transaction-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: 'account-1',
						to_entity_id: 'category-1',
						amount: 42.5,
					})
				);
			});
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('resets state when visible toggles off and back on', async () => {
			useStore.setState({
				entities: [incomeEntity, accountEntity, categoryEntity],
				addTransaction: jest.fn(),
			});

			const { getByTestId, getByText, rerender } = render(
				<TransactionModal
					visible={true}
					fromEntity={null}
					toEntity={null}
					onClose={mockOnClose}
					quickAdd
				/>
			);

			// Complete first flow: pick entities + type amount
			await act(async () => jest.advanceTimersByTime(400));
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

			// From-entity picker should auto-open again (entities visible)
			await act(async () => jest.advanceTimersByTime(400));
			expect(getByText('Salary')).toBeTruthy();
		});
	});
});

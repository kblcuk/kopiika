import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { EntityDetailModal } from '../entity-detail-modal';
import {
	setupStoreForTest,
	createMockEntity,
	createMockTransaction,
} from '@/src/test-utils-component';
import type { EntityWithBalance } from '@/src/types';
import { useStore } from '@/src/store';
import { BALANCE_ADJUSTMENT_ENTITY_ID } from '@/src/constants/system-entities';
import { ICON_OPTIONS } from '@/src/constants/icons';
import { formatAmount } from '@/src/utils/format';

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	selectionAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
	NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Mock Alert.alert
jest.spyOn(Alert, 'alert');

describe('EntityDetailModal', () => {
	const mockEntity: EntityWithBalance = {
		id: 'entity-1',
		type: 'category',
		name: 'Groceries',
		currency: 'EUR',
		icon: 'shopping-bag',
		order: 0,
		row: 0,
		position: 0,
		actual: 250,
		planned: 500,
		remaining: 250,
		upcoming: 0,
	};

	const mockOnClose = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		setupStoreForTest({ currentPeriod: '2026-01' });
	});

	describe('Rendering', () => {
		it('renders modal with entity data', () => {
			const { getByText, getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			expect(getByText('Edit Entity')).toBeTruthy();
			expect(getByTestId('entity-detail-name-input')).toBeTruthy();
			expect(getByTestId('entity-detail-amount-input')).toBeTruthy();
			expect(getByTestId('entity-detail-save-button')).toBeTruthy();
		});

		it('returns null when entity is null', () => {
			const { toJSON } = render(
				<EntityDetailModal visible={true} entity={null} onClose={mockOnClose} />
			);

			expect(toJSON()).toBeNull();
		});

		it('pre-fills name input with entity name', () => {
			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			const nameInput = getByTestId('entity-detail-name-input');
			expect(nameInput.props.value).toBe('Groceries');
		});

		it.each([
			{
				type: 'category' as const,
				name: 'Groceries',
				actual: 250,
				remaining: -250,
			},
			{
				type: 'saving' as const,
				name: 'Emergency Fund',
				actual: 1200,
				remaining: -1200,
			},
		])('hides Remaining when %s has no planned amount', ({ type, name, actual, remaining }) => {
			const { queryByText, getByText } = render(
				<EntityDetailModal
					visible={true}
					entity={{
						...mockEntity,
						type,
						name,
						actual,
						planned: 0,
						remaining,
					}}
					onClose={mockOnClose}
				/>
			);

			expect(queryByText('Remaining')).toBeNull();
			expect(getByText(formatAmount(actual))).toBeTruthy();
		});

		it('never shows Remaining for income entities even with a plan', () => {
			const { queryByText, getByText } = render(
				<EntityDetailModal
					visible={true}
					entity={{
						...mockEntity,
						type: 'income',
						name: 'Salary',
						actual: 3000,
						planned: 5000,
						remaining: 2000,
					}}
					onClose={mockOnClose}
				/>
			);

			expect(queryByText('Remaining')).toBeNull();
			expect(getByText(formatAmount(3000))).toBeTruthy();
		});
	});

	describe('Name Validation', () => {
		it('does not save when name is empty', async () => {
			const updateEntitySpy = jest.fn();
			useStore.setState({ updateEntity: updateEntitySpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-name-input'), '');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			// Wait a tick to ensure no async operations
			await waitFor(() => {
				expect(updateEntitySpy).not.toHaveBeenCalled();
			});
		});

		it('does not save when name is only whitespace', async () => {
			const updateEntitySpy = jest.fn();
			useStore.setState({ updateEntity: updateEntitySpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-name-input'), '   ');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).not.toHaveBeenCalled();
			});
		});

		it('shows error when name exceeds the shared limit', () => {
			const { getByTestId, getByText } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			const nameInput = getByTestId('entity-detail-name-input');
			const longName = 'a'.repeat(101);
			fireEvent.changeText(nameInput, longName);

			expect(getByText(/Name is too long/)).toBeTruthy();
		});

		it('does not save when name is too long', async () => {
			const updateEntitySpy = jest.fn();
			useStore.setState({ updateEntity: updateEntitySpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-name-input'), 'a'.repeat(101));
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).not.toHaveBeenCalled();
			});
		});

		it('allows saving a reasonably long name', async () => {
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			const longName = 'Emergency fund for yearly tax buffer';

			useStore.setState({ updateEntity: updateEntitySpy, setPlan: setPlanSpy });

			const { getByTestId, queryByText } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-name-input'), longName);
			expect(queryByText(/Name is too long/)).toBeNull();
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						id: mockEntity.id,
						name: longName,
					})
				);
			});
		});
	});

	describe('Entity Update', () => {
		it('updates entity with new name', async () => {
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ updateEntity: updateEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-name-input'), 'Food');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 'entity-1',
						name: 'Food',
						type: 'category',
					})
				);
			});

			expect(mockOnClose).toHaveBeenCalled();
		});

		it('updates plan amount', async () => {
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			setupStoreForTest({
				currentPeriod: '2026-01',
				plans: [
					{
						id: 'plan-1',
						entity_id: 'entity-1',
						period: 'all-time',
						period_start: '2026-01',
						planned_amount: 500,
					},
				],
			});
			useStore.setState({ updateEntity: updateEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-amount-input'), '600');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						entity_id: 'entity-1',
						planned_amount: 600,
					})
				);
			});
		});

		it('does not create a zero-value plan when saving an unplanned entity', async () => {
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			const deletePlanSpy = jest.fn();
			useStore.setState({
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
				deletePlan: deletePlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={{ ...mockEntity, planned: 0, remaining: -250 }}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('entity-detail-name-input'), 'Food');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).toHaveBeenCalled();
			});

			expect(setPlanSpy).not.toHaveBeenCalled();
			expect(deletePlanSpy).not.toHaveBeenCalled();
		});

		it('preserves existing plan when updating', async () => {
			const setPlanSpy = jest.fn();
			const updateEntitySpy = jest.fn();

			// Set up with plan for current period - all plans use 'all-time' period
			useStore.setState({
				currentPeriod: '2026-01',
				plans: [
					{
						id: 'plan-1',
						entity_id: 'entity-1',
						period: 'all-time',
						period_start: '2026-01',
						planned_amount: 500,
					},
				],
				setPlan: setPlanSpy,
				updateEntity: updateEntitySpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 'plan-1', // Should reuse existing plan
						period_start: '2026-01',
					})
				);
			});
		});

		it('deletes an existing plan when the planned amount is cleared', async () => {
			const setPlanSpy = jest.fn();
			const deletePlanSpy = jest.fn();
			const updateEntitySpy = jest.fn();

			setupStoreForTest({
				currentPeriod: '2026-01',
				plans: [
					{
						id: 'plan-1',
						entity_id: 'entity-1',
						period: 'all-time',
						period_start: '2026-01',
						planned_amount: 500,
					},
				],
			});
			useStore.setState({
				setPlan: setPlanSpy,
				deletePlan: deletePlanSpy,
				updateEntity: updateEntitySpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-amount-input'), '');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(deletePlanSpy).toHaveBeenCalledWith('plan-1');
			});

			expect(setPlanSpy).not.toHaveBeenCalled();
		});

		it('supports browsing and selecting icons in the expanded picker', async () => {
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ updateEntity: updateEntitySpy, setPlan: setPlanSpy });

			const { getByTestId, queryByTestId, getByText } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-detail-icon-picker-toggle'));
			expect(queryByTestId('entity-detail-icon-option-shield')).toBeNull();
			expect(getByText(`Show all ${ICON_OPTIONS.category.length} icons`)).toBeTruthy();

			fireEvent.press(getByText(`Show all ${ICON_OPTIONS.category.length} icons`));

			expect(getByTestId('entity-detail-icon-option-shield')).toBeTruthy();

			fireEvent.press(getByTestId('entity-detail-icon-option-shield'));
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 'entity-1',
						icon: 'shield',
					})
				);
			});
		});

		it('can expand and collapse the idle icon grid without searching', () => {
			const { getByTestId, getByText, queryByTestId, queryByText } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-detail-icon-picker-toggle'));

			expect(queryByTestId('entity-detail-icon-option-shield')).toBeNull();
			expect(queryByText('Show less icons')).toBeNull();

			fireEvent.press(getByText(`Show all ${ICON_OPTIONS.category.length} icons`));

			expect(getByTestId('entity-detail-icon-option-shield')).toBeTruthy();
			expect(getByText('Show less icons')).toBeTruthy();

			fireEvent.press(getByText('Show less icons'));

			expect(queryByTestId('entity-detail-icon-option-shield')).toBeNull();
		});
	});

	describe('Delete Functionality', () => {
		it('shows confirmation alert when delete is pressed', () => {
			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-detail-delete-button'));

			expect(Alert.alert).toHaveBeenCalledWith(
				'Delete Entity',
				expect.stringContaining('Groceries'),
				expect.arrayContaining([
					expect.objectContaining({ text: 'Cancel' }),
					expect.objectContaining({ text: 'Delete' }),
				])
			);
		});

		it('deletes entity when confirmed', async () => {
			const deleteEntitySpy = jest.fn();
			useStore.setState({ deleteEntity: deleteEntitySpy });

			// Mock Alert.alert to auto-confirm
			(Alert.alert as jest.Mock).mockImplementation((title, message, buttons) => {
				const deleteButton = buttons.find((b: any) => b.text === 'Delete');
				if (deleteButton && deleteButton.onPress) {
					deleteButton.onPress();
				}
			});

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-detail-delete-button'));

			await waitFor(() => {
				expect(deleteEntitySpy).toHaveBeenCalledWith('entity-1');
				expect(mockOnClose).toHaveBeenCalled();
			});
		});
	});

	describe('Cancel Button', () => {
		it('calls onClose when cancel is pressed', () => {
			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-detail-cancel-button'));

			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	describe('Plan Period', () => {
		it('uses all-time period for saving entities', async () => {
			const savingEntity: EntityWithBalance = {
				...mockEntity,
				type: 'saving',
				name: 'Vacation',
			};

			const setPlanSpy = jest.fn();
			useStore.setState({ setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={savingEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-amount-input'), '500');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						period: 'all-time',
					})
				);
			});
		});

		it('uses all-time period for all entity types', async () => {
			const setPlanSpy = jest.fn();
			useStore.setState({ setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-detail-amount-input'), '500');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						period: 'all-time',
					})
				);
			});
		});
	});

	describe('Balance Adjustment (Account Entities)', () => {
		const mockAccountEntity: EntityWithBalance = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			icon: 'wallet',
			order: 0,
			row: 0,
			position: 0,
			actual: 1000,
			planned: 0,
			remaining: -1000,
			upcoming: 0,
		};

		it('shows editable actual amount field for account entities', () => {
			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Should have an input for actual amount
			const actualInput = getByTestId('entity-detail-actual-input');
			expect(actualInput).toBeTruthy();
			expect(actualInput.props.value).toBe('1000');
		});

		it('does not show editable actual amount for non-account entities', () => {
			const { queryByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			// Should NOT have an input for actual amount
			const actualInput = queryByTestId('entity-detail-actual-input');
			expect(actualInput).toBeNull();
		});

		it('does not show planned amount input for accounts', () => {
			const { queryByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			expect(queryByTestId('entity-detail-amount-input')).toBeNull();
		});

		it('shows total including savings when reserved > 0', () => {
			const entityWithReservation = {
				...mockAccountEntity,
				actual: 1000,
				reserved: 300,
			};
			const { getByText } = render(
				<EntityDetailModal
					visible={true}
					entity={entityWithReservation}
					onClose={mockOnClose}
				/>
			);

			expect(getByText('Total (incl. savings)')).toBeTruthy();
			expect(getByText(formatAmount(1300))).toBeTruthy();
		});

		it('creates positive adjustment transaction when increasing balance', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Change balance from 1000 to 1500
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '1500');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
						to_entity_id: 'account-1',
						amount: 500, // 1500 - 1000
						currency: 'USD',
						note: expect.stringContaining('Balance correction'),
					})
				);
			});
		});

		it('creates negative adjustment transaction when decreasing balance', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Change balance from 1000 to 800
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '800');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: 'account-1',
						to_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
						amount: 200, // 1000 - 800
						currency: 'USD',
						note: expect.stringContaining('Balance correction'),
					})
				);
			});
		});

		it('does not create adjustment transaction when balance unchanged', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Don't change balance (or change to same value)
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '1000');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				// Should not create adjustment transaction
				expect(addTransactionSpy).not.toHaveBeenCalled();
				// But should still update entity
				expect(updateEntitySpy).toHaveBeenCalled();
			});

			expect(setPlanSpy).not.toHaveBeenCalled();
		});

		it('does not create adjustment transaction if actual amount was not edited', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Only change name, don't touch actual amount
			fireEvent.changeText(getByTestId('entity-detail-name-input'), 'Savings Account');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				// Should not create adjustment transaction
				expect(addTransactionSpy).not.toHaveBeenCalled();
				// But should still update entity
				expect(updateEntitySpy).toHaveBeenCalled();
			});
		});

		it('includes correct note in adjustment transaction', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Change balance
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '1250');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				const call = addTransactionSpy.mock.calls[0][0];
				expect(call.note).toContain('Balance correction');
				expect(call.note).toContain('1,000'); // formatAmount adds commas
				expect(call.note).toContain('1,250');
			});
		});

		it('handles zero as target balance', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Change balance to 0
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '0');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: 'account-1',
						to_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
						amount: 1000,
					})
				);
				// Check note separately to avoid exact format matching
				const call = addTransactionSpy.mock.calls[0][0];
				expect(call.note).toContain('Balance correction');
			});
		});

		it('handles decimal balance with dot separator', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Change balance to 1001.15 (increase by 1.15)
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '1001.15');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						amount: 1.15,
					})
				);
			});
		});

		it('handles decimal balance with comma separator (European format)', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
				setPlan: setPlanSpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			// Change balance to 1001,15 (European format, increase by 1.15)
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '1001,15');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						amount: 1.15,
					})
				);
			});
		});

		it('rounds floating point amounts when displaying', () => {
			// Test that floating point precision issues are handled when displaying
			const entityWithFloatingPointAmount = {
				...mockAccountEntity,
				actual: 1000.1500000000091, // Floating point artifact
			};

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={entityWithFloatingPointAmount}
					onClose={mockOnClose}
				/>
			);

			const actualInput = getByTestId('entity-detail-actual-input');
			// Should display "1000.15", not "1000.1500000000091"
			expect(actualInput.props.value).toBe('1000.15');
		});

		it('replaces a default zero when typing a new balance', () => {
			const zeroBalanceAccount = {
				...mockAccountEntity,
				actual: 0,
			};

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={zeroBalanceAccount}
					onClose={mockOnClose}
				/>
			);

			const actualInput = getByTestId('entity-detail-actual-input');
			expect(actualInput.props.value).toBe('0');

			fireEvent.changeText(actualInput, '05');

			expect(getByTestId('entity-detail-actual-input').props.value).toBe('5');
		});

		it('creates adjustment from zero starting balance', async () => {
			const addTransactionSpy = jest.fn();
			const updateEntitySpy = jest.fn();

			useStore.setState({
				addTransaction: addTransactionSpy,
				updateEntity: updateEntitySpy,
			});

			const zeroBalanceAccount: EntityWithBalance = {
				...mockAccountEntity,
				actual: 0,
				remaining: 0,
			};

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={zeroBalanceAccount}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '500');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
						to_entity_id: 'account-1',
						amount: 500,
						note: expect.stringContaining('Balance correction'),
					})
				);
			});
		});

		it('creates adjustment when updateEntity triggers a store re-render', async () => {
			// Use updateEntity that actually triggers re-render via Zustand set()
			// to verify the async closure isn't broken by the re-render cycle.
			const addTransactionSpy = jest.fn();
			const balanceAdjEntity = {
				id: BALANCE_ADJUSTMENT_ENTITY_ID,
				type: 'account' as const,
				name: 'Balance Adjustments',
				currency: 'USD',
				icon: 'refresh-cw',
				order: 0,
				row: 0,
				position: -1,
			};
			const accountEntity = {
				id: 'account-1',
				type: 'account' as const,
				name: 'Checking',
				currency: 'USD',
				icon: 'wallet',
				order: 0,
				row: 0,
				position: 0,
			};

			setupStoreForTest({
				entities: [balanceAdjEntity, accountEntity],
				currentPeriod: '2026-01',
			});

			useStore.setState({
				updateEntity: async (entity) => {
					useStore.setState((state) => ({
						entities: state.entities.map((e) => (e.id === entity.id ? entity : e)),
					}));
				},
				addTransaction: addTransactionSpy,
			});

			const zeroBalanceAccount: EntityWithBalance = {
				...accountEntity,
				actual: 0,
				planned: 0,
				remaining: 0,
				upcoming: 0,
			};

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={zeroBalanceAccount}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '500');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
						to_entity_id: 'account-1',
						amount: 500,
					})
				);
			});
		});

		it('creates adjustment when updateEntity + setDefaultAccount both re-render', async () => {
			// Simulate full save path: updateEntity re-renders, then
			// setDefaultAccount re-renders again, then addTransaction runs.
			const addTransactionSpy = jest.fn();
			const balanceAdjEntity = {
				id: BALANCE_ADJUSTMENT_ENTITY_ID,
				type: 'account' as const,
				name: 'Balance Adjustments',
				currency: 'USD',
				icon: 'refresh-cw',
				order: 0,
				row: 0,
				position: -1,
			};
			const accountEntity = {
				id: 'account-1',
				type: 'account' as const,
				name: 'Checking',
				currency: 'USD',
				icon: 'wallet',
				order: 0,
				row: 0,
				position: 0,
			};

			setupStoreForTest({
				entities: [balanceAdjEntity, accountEntity],
				currentPeriod: '2026-01',
			});

			useStore.setState({
				updateEntity: async (entity) => {
					useStore.setState((state) => ({
						entities: state.entities.map((e) => (e.id === entity.id ? entity : e)),
					}));
				},
				setDefaultAccount: async (accountId) => {
					useStore.setState((state) => ({
						entities: state.entities.map((e) =>
							e.type === 'account' ? { ...e, is_default: e.id === accountId } : e
						),
					}));
				},
				addTransaction: addTransactionSpy,
			});

			const zeroBalanceAccount: EntityWithBalance = {
				...accountEntity,
				actual: 0,
				planned: 0,
				remaining: 0,
				upcoming: 0,
			};

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={zeroBalanceAccount}
					onClose={mockOnClose}
				/>
			);

			// Change balance AND toggle default account (to trigger both re-renders)
			fireEvent.changeText(getByTestId('entity-detail-actual-input'), '500');
			fireEvent(getByTestId('entity-detail-is-default-switch'), 'valueChange', true);
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addTransactionSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						from_entity_id: BALANCE_ADJUSTMENT_ENTITY_ID,
						to_entity_id: 'account-1',
						amount: 500,
					})
				);
			});
		});
	});

	describe('Default Account Toggle', () => {
		const mockAccountEntity: EntityWithBalance = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			icon: 'wallet',
			order: 0,
			row: 0,
			position: 0,
			actual: 1000,
			planned: 0,
			remaining: -1000,
			upcoming: 0,
		};

		it('shows default account toggle for account entities', () => {
			const { getByTestId, getByText } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			expect(getByTestId('entity-detail-is-default-switch')).toBeTruthy();
			expect(getByText('Default account')).toBeTruthy();
			expect(getByText('Pre-selected when adding transactions')).toBeTruthy();
		});

		it('does not show default account toggle for non-account entities', () => {
			const { queryByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			expect(queryByTestId('entity-detail-is-default-switch')).toBeNull();
		});

		it('initializes toggle to off when entity is not default', () => {
			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			const toggle = getByTestId('entity-detail-is-default-switch');
			expect(toggle.props.value).toBe(false);
		});

		it('initializes toggle to on when entity is default', () => {
			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={{ ...mockAccountEntity, is_default: true }}
					onClose={mockOnClose}
				/>
			);

			const toggle = getByTestId('entity-detail-is-default-switch');
			expect(toggle.props.value).toBe(true);
		});

		it('calls setDefaultAccount when toggling on', async () => {
			const setDefaultAccountSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			useStore.setState({
				setDefaultAccount: setDefaultAccountSpy,
				updateEntity: updateEntitySpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent(getByTestId('entity-detail-is-default-switch'), 'valueChange', true);
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setDefaultAccountSpy).toHaveBeenCalledWith('account-1');
			});
		});

		it('calls setDefaultAccount(null) when toggling off', async () => {
			const setDefaultAccountSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			useStore.setState({
				setDefaultAccount: setDefaultAccountSpy,
				updateEntity: updateEntitySpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={{ ...mockAccountEntity, is_default: true }}
					onClose={mockOnClose}
				/>
			);

			fireEvent(getByTestId('entity-detail-is-default-switch'), 'valueChange', false);
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setDefaultAccountSpy).toHaveBeenCalledWith(null);
			});
		});

		it('does not call setDefaultAccount when toggle unchanged', async () => {
			const setDefaultAccountSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			useStore.setState({
				setDefaultAccount: setDefaultAccountSpy,
				updateEntity: updateEntitySpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).toHaveBeenCalled();
			});
			expect(setDefaultAccountSpy).not.toHaveBeenCalled();
		});
	});

	describe('Account Reservations (Reserved For)', () => {
		const mockAccountEntity: EntityWithBalance = {
			id: 'account-1',
			type: 'account',
			name: 'Main Card',
			currency: 'EUR',
			icon: 'wallet',
			order: 0,
			row: 0,
			position: 0,
			actual: 1000,
			planned: 0,
			remaining: -1000,
			upcoming: 0,
			reserved: 250,
		};

		it('shows "Reserved for" section with per-saving breakdown', () => {
			const savingEntity = createMockEntity({
				id: 'saving-1',
				type: 'saving',
				name: 'Emergency Fund',
				icon: 'shield',
			});
			const savingEntity2 = createMockEntity({
				id: 'saving-2',
				type: 'saving',
				name: 'Vacation',
				icon: 'palmtree',
			});

			setupStoreForTest({
				entities: [
					createMockEntity({ id: 'account-1', type: 'account', name: 'Main Card' }),
					savingEntity,
					savingEntity2,
				],
				transactions: [
					createMockTransaction({
						id: 'tx-1',
						from_entity_id: 'account-1',
						to_entity_id: 'saving-1',
						amount: 100,
					}),
					createMockTransaction({
						id: 'tx-2',
						from_entity_id: 'account-1',
						to_entity_id: 'saving-2',
						amount: 150,
					}),
				],
			});

			const { getAllByText, getByTestId, getByText } = render(
				<EntityDetailModal
					visible={true}
					entity={mockAccountEntity}
					onClose={mockOnClose}
				/>
			);

			expect(getByTestId('account-reservations-section')).toBeTruthy();
			expect(getByText('Reserved for')).toBeTruthy();
			expect(getByTestId('account-reservations-pie-chart')).toBeTruthy();
			expect(getByTestId('account-reservation-row-saving-1')).toBeTruthy();
			expect(getByTestId('account-reservation-row-saving-2')).toBeTruthy();
			expect(getAllByText('Emergency Fund').length).toBeGreaterThan(0);
			expect(getAllByText('Vacation').length).toBeGreaterThan(0);
		});

		it('shows empty state when no reservations exist', () => {
			setupStoreForTest({
				entities: [
					createMockEntity({ id: 'account-1', type: 'account', name: 'Main Card' }),
				],
				transactions: [],
			});

			const { getByText } = render(
				<EntityDetailModal
					visible={true}
					entity={{ ...mockAccountEntity, reserved: 0 }}
					onClose={mockOnClose}
				/>
			);

			expect(
				getByText('Drag a savings goal onto this account to reserve funds')
			).toBeTruthy();
		});

		it('does not show "Reserved for" section for non-account entities', () => {
			const { queryByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={{ ...mockAccountEntity, type: 'category', id: 'cat-1' }}
					onClose={mockOnClose}
				/>
			);

			expect(queryByTestId('account-reservations-section')).toBeNull();
		});
	});

	describe('Investment Account', () => {
		const mockInvestmentAccount: EntityWithBalance = {
			id: 'inv-account',
			type: 'account',
			name: 'Brokerage',
			currency: 'USD',
			icon: 'trending-up',
			order: 0,
			row: 0,
			position: 0,
			actual: 5000,
			planned: 0,
			remaining: -5000,
			upcoming: 0,
			is_investment: true,
			latestMarketValue: 7500,
		};

		const mockAccountEntity: EntityWithBalance = {
			id: 'account-1',
			type: 'account',
			name: 'Checking',
			currency: 'USD',
			icon: 'wallet',
			order: 0,
			row: 0,
			position: 0,
			actual: 1000,
			planned: 0,
			remaining: -1000,
			upcoming: 0,
		};

		it('shows investment toggle for account entities', () => {
			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockInvestmentAccount}
					onClose={mockOnClose}
				/>
			);

			expect(getByTestId('entity-detail-investment-switch')).toBeTruthy();
		});

		it('initializes investment toggle to on for investment accounts', () => {
			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockInvestmentAccount}
					onClose={mockOnClose}
				/>
			);

			const toggle = getByTestId('entity-detail-investment-switch');
			expect(toggle.props.value).toBe(true);
		});

		it('shows market value input when investment mode is enabled', () => {
			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockInvestmentAccount}
					onClose={mockOnClose}
				/>
			);

			expect(getByTestId('entity-detail-market-value-input')).toBeTruthy();
		});

		it('hides market value input when investment mode is disabled', () => {
			const { queryByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={{ ...mockAccountEntity, is_investment: false }}
					onClose={mockOnClose}
				/>
			);

			expect(queryByTestId('entity-detail-market-value-input')).toBeNull();
		});

		it('saves is_investment when toggling investment mode', async () => {
			const updateEntitySpy = jest.fn();
			useStore.setState({ updateEntity: updateEntitySpy });

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={{ ...mockAccountEntity, is_investment: false }}
					onClose={mockOnClose}
				/>
			);

			fireEvent(getByTestId('entity-detail-investment-switch'), 'valueChange', true);
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 'account-1',
						is_investment: true,
					})
				);
			});
		});

		it('does not delete snapshots immediately when disabling investment mode', async () => {
			const updateEntityWithOptionsSpy = jest.fn();
			useStore.setState({
				marketValueSnapshots: [
					{
						id: 'snap-1',
						entity_id: 'inv-account',
						amount: 7500,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				updateEntityWithOptions: updateEntityWithOptionsSpy,
			});

			(Alert.alert as jest.Mock).mockImplementation((title, _message, buttons) => {
				if (title === 'Turn Off Investment Account?') {
					const confirmButton = buttons?.find((b: any) => b.text === 'Confirm');
					confirmButton?.onPress?.();
				}
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockInvestmentAccount}
					onClose={mockOnClose}
				/>
			);

			fireEvent(getByTestId('entity-detail-investment-switch'), 'valueChange', false);

			expect(updateEntityWithOptionsSpy).not.toHaveBeenCalled();

			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntityWithOptionsSpy).toHaveBeenCalledWith(
					expect.objectContaining({ id: 'inv-account', is_investment: false }),
					{ deleteMarketValueSnapshots: true }
				);
			});
		});

		it('does not delete snapshots if user disables investment mode then cancels modal', () => {
			const updateEntityWithOptionsSpy = jest.fn();
			useStore.setState({
				marketValueSnapshots: [
					{
						id: 'snap-1',
						entity_id: 'inv-account',
						amount: 7500,
						currency: 'USD',
						date: new Date('2026-01-15').getTime(),
					},
				],
				updateEntityWithOptions: updateEntityWithOptionsSpy,
			});

			(Alert.alert as jest.Mock).mockImplementation((title, _message, buttons) => {
				if (title === 'Turn Off Investment Account?') {
					const confirmButton = buttons?.find((b: any) => b.text === 'Confirm');
					confirmButton?.onPress?.();
				}
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockInvestmentAccount}
					onClose={mockOnClose}
				/>
			);

			fireEvent(getByTestId('entity-detail-investment-switch'), 'valueChange', false);
			fireEvent.press(getByTestId('entity-detail-cancel-button'));

			expect(updateEntityWithOptionsSpy).not.toHaveBeenCalled();
		});

		it('creates market value snapshot when saving with market value input', async () => {
			const addMarketValueSnapshotSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			useStore.setState({
				addMarketValueSnapshot: addMarketValueSnapshotSpy,
				updateEntity: updateEntitySpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockInvestmentAccount}
					onClose={mockOnClose}
				/>
			);

			fireEvent.changeText(getByTestId('entity-detail-market-value-input'), '8000');
			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(addMarketValueSnapshotSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						entity_id: 'inv-account',
						amount: 8000,
						currency: 'USD',
					})
				);
			});
		});

		it('does not create snapshot when market value input is empty', async () => {
			const addMarketValueSnapshotSpy = jest.fn();
			const updateEntitySpy = jest.fn();
			useStore.setState({
				addMarketValueSnapshot: addMarketValueSnapshotSpy,
				updateEntity: updateEntitySpy,
			});

			const { getByTestId } = render(
				<EntityDetailModal
					visible={true}
					entity={mockInvestmentAccount}
					onClose={mockOnClose}
				/>
			);

			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(updateEntitySpy).toHaveBeenCalled();
			});
			expect(addMarketValueSnapshotSpy).not.toHaveBeenCalled();
		});
	});
});

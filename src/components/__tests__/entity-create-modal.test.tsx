import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { EntityCreateModal } from '../entity-create-modal';
import { setupStoreForTest } from '@/src/test-utils-component';
import { useStore } from '@/src/store';
import { ICON_OPTIONS } from '@/src/constants/icons';

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	selectionAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
	NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

describe('EntityCreateModal', () => {
	const mockOnClose = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		setupStoreForTest({ currentPeriod: '2026-01' });
	});

	describe('Rendering', () => {
		it('renders modal for different entity types', () => {
			const types = [
				{ type: 'income' as const, label: 'Income Source' },
				{ type: 'account' as const, label: 'Account' },
				{ type: 'category' as const, label: 'Expense Category' },
				{ type: 'saving' as const, label: 'Savings Goal' },
			];

			types.forEach(({ type, label }) => {
				const { getByText, getByTestId } = render(
					<EntityCreateModal visible={true} entityType={type} onClose={mockOnClose} />
				);

				expect(getByText(`New ${label}`)).toBeTruthy();
				expect(getByTestId('entity-create-name-input')).toBeTruthy();
				expect(getByTestId('entity-create-save-button')).toBeTruthy();
			});
		});

		it('returns null when entityType is null', () => {
			const { toJSON } = render(
				<EntityCreateModal visible={true} entityType={null} onClose={mockOnClose} />
			);

			expect(toJSON()).toBeNull();
		});


	});

	describe('Entity Creation', () => {
		it('does not create entity without name', () => {
			const addEntitySpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy });

			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="account" onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-create-save-button'));

			expect(addEntitySpy).not.toHaveBeenCalled();
			expect(mockOnClose).not.toHaveBeenCalled();
		});

		it('creates entity with a long dashboard label name', async () => {
			const addEntitySpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy });

			const longName = 'Emergency fund for yearly tax buffer';
			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="account" onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-create-name-input'), longName);
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(addEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						name: longName,
					})
				);
			});
		});

		it('creates entity with name only (no plan)', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="account" onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-create-name-input'), 'Checking');
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(addEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'account',
						name: 'Checking',
						currency: 'EUR',
					})
				);
			});

			expect(setPlanSpy).not.toHaveBeenCalled();
			expect(mockOnClose).toHaveBeenCalled();
		});

		it('submits from press-in without double-creating when press also fires', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="account" onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-create-name-input'), 'Checking');
			fireEvent(getByTestId('entity-create-save-button'), 'pressIn');
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(addEntitySpy).toHaveBeenCalledTimes(1);
				expect(addEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'account',
						name: 'Checking',
					})
				);
			});

			expect(setPlanSpy).not.toHaveBeenCalled();
			expect(mockOnClose).toHaveBeenCalledTimes(1);
		});

		it('creates entity with plan when amount specified', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="category" onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-create-name-input'), 'Groceries');
			fireEvent.changeText(getByTestId('entity-create-amount-input'), '500');
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(addEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'category',
						name: 'Groceries',
					})
				);
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						period: 'all-time',
						period_start: '2026-01',
						planned_amount: 500,
					})
				);
			});

			expect(mockOnClose).toHaveBeenCalled();
		});

		it('does not create plan when amount is zero', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="income" onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-create-name-input'), 'Salary');
			fireEvent.changeText(getByTestId('entity-create-amount-input'), '0');
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(addEntitySpy).toHaveBeenCalled();
			});

			expect(setPlanSpy).not.toHaveBeenCalled();
		});

		it('does not create plan when amount is invalid', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="income" onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-create-name-input'), 'Salary');
			fireEvent.changeText(getByTestId('entity-create-amount-input'), 'invalid');
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(addEntitySpy).toHaveBeenCalled();
			});

			expect(setPlanSpy).not.toHaveBeenCalled();
		});

		it('supports browsing the full icon catalog before create', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const { getByTestId, queryByTestId, getByText } = render(
				<EntityCreateModal visible={true} entityType="income" onClose={mockOnClose} />
			);

			expect(queryByTestId('entity-create-icon-option-shield')).toBeNull();
			expect(getByText(`Show all ${ICON_OPTIONS.income.length} icons`)).toBeTruthy();

			fireEvent.press(getByText(`Show all ${ICON_OPTIONS.income.length} icons`));

			expect(getByTestId('entity-create-icon-option-shield')).toBeTruthy();

			fireEvent.press(getByTestId('entity-create-icon-option-shield'));
			fireEvent.changeText(getByTestId('entity-create-name-input'), 'Safety Net');
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(addEntitySpy).toHaveBeenCalledWith(
					expect.objectContaining({
						type: 'income',
						name: 'Safety Net',
						icon: 'shield',
					})
				);
			});
		});
	});

	describe('Plan Period', () => {
		it('uses all-time period for saving entities', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="saving" onClose={mockOnClose} />
			);

			fireEvent.changeText(getByTestId('entity-create-name-input'), 'Vacation');
			fireEvent.changeText(getByTestId('entity-create-amount-input'), '5000');
			fireEvent.press(getByTestId('entity-create-save-button'));

			await waitFor(() => {
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						period: 'all-time',
						period_start: '2026-01',
						planned_amount: 5000,
					})
				);
			});
		});

		it('uses all-time period for all entity types', async () => {
			const addEntitySpy = jest.fn();
			const setPlanSpy = jest.fn();
			useStore.setState({ addEntity: addEntitySpy, setPlan: setPlanSpy });

			const types: ('income' | 'account' | 'category')[] = ['income', 'account', 'category'];

			for (const type of types) {
				jest.clearAllMocks();

				const { getByTestId } = render(
					<EntityCreateModal visible={true} entityType={type} onClose={mockOnClose} />
				);

				fireEvent.changeText(getByTestId('entity-create-name-input'), 'Test');
				fireEvent.changeText(getByTestId('entity-create-amount-input'), '1000');
				fireEvent.press(getByTestId('entity-create-save-button'));

				await waitFor(() => {
					expect(setPlanSpy).toHaveBeenCalledWith(
						expect.objectContaining({
							period: 'all-time',
						})
					);
				});
			}
		});
	});

	describe('Cancel Button', () => {
		it('calls onClose when cancel is pressed', () => {
			const { getByTestId } = render(
				<EntityCreateModal visible={true} entityType="account" onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-create-cancel-button'));

			expect(mockOnClose).toHaveBeenCalled();
		});
	});
});

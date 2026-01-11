import React from 'react';
import { render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { EntityDetailModal } from '../entity-detail-modal';
import { setupStoreForTest, fireEvent, waitFor } from '@/src/test-utils-component';
import type { EntityWithBalance } from '@/src/types';
import { useStore } from '@/src/store';

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
		currency: 'UAH',
		icon: 'shopping-bag',
		order: 0,
		actual: 250,
		planned: 500,
		remaining: 250,
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

		it('shows error when name exceeds 100 characters', () => {
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
						period: 'month',
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

		it('preserves existing plan when updating', async () => {
			const setPlanSpy = jest.fn();
			const updateEntitySpy = jest.fn();

			// Set up with plan for current period
			useStore.setState({
				currentPeriod: '2026-01',
				plans: [
					{
						id: 'plan-1',
						entity_id: 'entity-1',
						period: 'month',
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

			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						period: 'all-time',
					})
				);
			});
		});

		it('uses month period for non-saving entities', async () => {
			const setPlanSpy = jest.fn();
			useStore.setState({ setPlan: setPlanSpy });

			const { getByTestId } = render(
				<EntityDetailModal visible={true} entity={mockEntity} onClose={mockOnClose} />
			);

			fireEvent.press(getByTestId('entity-detail-save-button'));

			await waitFor(() => {
				expect(setPlanSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						period: 'month',
					})
				);
			});
		});
	});
});

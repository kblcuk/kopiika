import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { TransactionRow } from '../transaction-row';
import type { Entity, Transaction } from '@/src/types';

jest.mock('react-native-gesture-handler', () => {
	const { View } = jest.requireActual('react-native');
	return {
		GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
		Gesture: {
			Pan: () => ({
				activeOffsetX() {
					return this;
				},
				onUpdate() {
					return this;
				},
				onEnd() {
					return this;
				},
			}),
		},
	};
});

jest.mock('react-native-reanimated', () => {
	const RN = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: {
			View: RN.View,
		},
		useSharedValue: (value: number) => ({ value }),
		useAnimatedStyle: () => ({}),
		withSpring: (value: number) => value,
		withTiming: (value: number) => value,
	};
});

jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn((fn) => fn()) }));

jest.mock('@/src/constants/icon-registry', () => {
	const { Text } = jest.requireActual('react-native');
	return {
		getIcon: () => () => <Text testID="mock-icon">Icon</Text>,
	};
});

jest.mock('lucide-react-native', () => {
	const { Text } = jest.requireActual('react-native');
	return {
		Clock: () => <Text testID="clock-icon">Clock</Text>,
		Trash2: () => <Text>Trash</Text>,
	};
});

describe('TransactionRow', () => {
	const account: Entity = {
		id: 'account-1',
		type: 'account',
		name: 'Checking',
		currency: 'USD',
		row: 0,
		position: 0,
		order: 0,
	};

	const category: Entity = {
		id: 'category-1',
		type: 'category',
		name: 'Groceries',
		currency: 'USD',
		row: 0,
		position: 1,
		order: 1,
	};

	const transaction: Transaction = {
		id: 'tx-1',
		from_entity_id: 'account-1',
		to_entity_id: 'category-1',
		amount: 150,
		currency: 'USD',
		timestamp: new Date('2026-01-20T12:00:00Z').getTime(),
	};

	const entityMap = new Map<string, Entity>([
		[account.id, account],
		[category.id, category],
	]);

	it('renders a clock icon for upcoming transactions', () => {
		const { getByTestId } = render(
			<TransactionRow
				transaction={transaction}
				entityMap={entityMap}
				onEdit={jest.fn()}
				index={0}
				isUpcoming={true}
			/>
		);

		expect(getByTestId('clock-icon')).toBeTruthy();
	});

	it('does not render a clock icon for non-upcoming transactions', () => {
		const { queryByTestId } = render(
			<TransactionRow
				transaction={transaction}
				entityMap={entityMap}
				onEdit={jest.fn()}
				index={0}
				isUpcoming={false}
			/>
		);

		expect(queryByTestId('clock-icon')).toBeNull();
	});

	it('renders removed labels for deleted entities', () => {
		const deletedEntityMap = new Map<string, Entity>([
			[
				account.id,
				{
					...account,
					is_deleted: true,
				},
			],
			[category.id, category],
		]);

		const { getByText } = render(
			<TransactionRow
				transaction={transaction}
				entityMap={deletedEntityMap}
				onEdit={jest.fn()}
				index={0}
				isUpcoming={false}
			/>
		);

		expect(getByText('Removed account')).toBeTruthy();
		expect(getByText('Groceries')).toBeTruthy();
	});

	it('does not call onEdit when the row is read-only', () => {
		const onEdit = jest.fn();
		const { getByTestId } = render(
			<TransactionRow
				transaction={transaction}
				entityMap={entityMap}
				onEdit={onEdit}
				index={0}
				isUpcoming={false}
				editable={false}
			/>
		);

		fireEvent.press(getByTestId('transaction-row-tx-1'));

		expect(onEdit).not.toHaveBeenCalled();
	});
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';

import { TransactionRow } from '../transaction-row';
import { useStore } from '@/src/store';
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
			Tap: () => ({
				maxDuration() {
					return this;
				},
				maxDistance() {
					return this;
				},
				runOnJS() {
					return this;
				},
				hitSlop() {
					return this;
				},
				requireExternalGestureToFail() {
					return this;
				},
				onEnd(callback: () => void) {
					(this as any)._callback = callback;
					return this;
				},
				// Helper to trigger the callback in tests
				fire() {
					(this as any)._callback();
				},
			}),
			Exclusive: (...gestures: any[]) => ({
				// Simple mock: just return the first one or a combined object
				...gestures[0],
				fireTap() {
					gestures.find((g) => g.fire)?.fire();
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
		Repeat: () => <Text testID="repeat-icon">Repeat</Text>,
		CircleAlert: () => <Text testID="alert-icon">Alert</Text>,
		CircleCheck: () => <Text testID="check-icon">Check</Text>,
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
		amount_minor: 15000,
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

		expect(getByText('Removed (Checking)')).toBeTruthy();
		expect(getByText('Groceries')).toBeTruthy();
	});

	it('calls onEdit when the row is tapped', () => {
		const onEdit = jest.fn();
		let tapCallback: any;

		// Re-mock specifically for this test to capture the callback
		const originalTap = Gesture.Tap;
		(Gesture as any).Tap = jest.fn().mockReturnValue({
			maxDuration: jest.fn().mockReturnThis(),
			maxDistance: jest.fn().mockReturnThis(),
			runOnJS: jest.fn().mockReturnThis(),
			hitSlop: jest.fn().mockReturnThis(),
			requireExternalGestureToFail: jest.fn().mockReturnThis(),
			onEnd: jest.fn().mockImplementation((cb) => {
				tapCallback = cb;
				return this;
			}),
		});

		render(
			<TransactionRow
				transaction={transaction}
				entityMap={entityMap}
				onEdit={onEdit}
				index={0}
			/>
		);

		if (tapCallback) tapCallback();
		expect(onEdit).toHaveBeenCalledWith(transaction);

		(Gesture as any).Tap = originalTap;
	});

	// KII-106: the row's tap gesture must defer to the Confirm pill's tap,
	// otherwise tapping the pill on a recurring-series row also opens the
	// "Edit Recurring Transaction" dialog. Verified at the structural level —
	// the runtime gesture race is covered by the History E2E suite.
	it('Confirm pill: row tap requires the pill gesture to fail (KII-106)', () => {
		const requireExternalGestureToFail = jest.fn().mockReturnThis();
		const originalTap = Gesture.Tap;
		(Gesture as any).Tap = jest.fn().mockReturnValue({
			maxDuration: jest.fn().mockReturnThis(),
			maxDistance: jest.fn().mockReturnThis(),
			runOnJS: jest.fn().mockReturnThis(),
			hitSlop: jest.fn().mockReturnThis(),
			requireExternalGestureToFail,
			onEnd: jest.fn().mockReturnThis(),
		});

		render(
			<TransactionRow
				transaction={transaction}
				entityMap={entityMap}
				onEdit={jest.fn()}
				index={0}
				isUnconfirmed={true}
			/>
		);

		expect(requireExternalGestureToFail).toHaveBeenCalled();

		(Gesture as any).Tap = originalTap;
	});

	it('Confirm pill: firing its gesture confirms the tx without opening edit', () => {
		const onEdit = jest.fn();
		const confirmTransactionSpy = jest.fn();
		useStore.setState({ confirmTransaction: confirmTransactionSpy });

		// Capture both tap gestures in the order they're constructed: pill first,
		// then the row.
		const tapCallbacks: (() => void)[] = [];
		const originalTap = Gesture.Tap;
		(Gesture as any).Tap = jest.fn().mockImplementation(() => ({
			maxDuration: jest.fn().mockReturnThis(),
			maxDistance: jest.fn().mockReturnThis(),
			runOnJS: jest.fn().mockReturnThis(),
			hitSlop: jest.fn().mockReturnThis(),
			requireExternalGestureToFail: jest.fn().mockReturnThis(),
			onEnd: jest.fn().mockImplementation(function (this: object, cb: () => void) {
				tapCallbacks.push(cb);
				return this;
			}),
		}));

		render(
			<TransactionRow
				transaction={{ ...transaction, series_id: 'series-1', is_confirmed: false }}
				entityMap={entityMap}
				onEdit={onEdit}
				index={0}
				isUnconfirmed={true}
			/>
		);

		// Pill gesture is registered before the row tap in transaction-row.tsx,
		// so tapCallbacks[0] is the pill's onEnd.
		tapCallbacks[0]?.();

		expect(confirmTransactionSpy).toHaveBeenCalledWith('tx-1');
		expect(onEdit).not.toHaveBeenCalled();

		(Gesture as any).Tap = originalTap;
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

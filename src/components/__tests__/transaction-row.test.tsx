import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
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
				_callback: () => {},
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
					this._callback = callback;
					return this;
				},
				// Helper to trigger the callback in tests
				fire() {
					this._callback();
				},
			}),
			Exclusive: (...gestures: { fire?: () => void }[]) => ({
				// Simple mock: just return the first one or a combined object
				...gestures[0],
				fireTap() {
					gestures.find((g) => g.fire)?.fire?.();
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
		let tapCallback: (() => void) | undefined;

		// Re-mock specifically for this test to capture the callback
		const originalTap = Gesture.Tap;
		Gesture.Tap = jest.fn().mockReturnValue({
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

		Gesture.Tap = originalTap;
	});

	// KII-106: the row's tap gesture must defer to the Confirm pill's tap,
	// otherwise tapping the pill on a recurring-series row also opens the
	// "Edit Recurring Transaction" dialog. Verified at the structural level —
	// the runtime gesture race is covered by the History E2E suite.
	it('Confirm pill: row tap requires the pill gesture to fail (KII-106)', () => {
		const requireExternalGestureToFail = jest.fn().mockReturnThis();
		const originalTap = Gesture.Tap;
		Gesture.Tap = jest.fn().mockReturnValue({
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

		Gesture.Tap = originalTap;
	});

	it('Confirm pill: firing its gesture confirms the tx without opening edit', () => {
		const onEdit = jest.fn();
		const confirmTransactionSpy = jest.fn();
		useStore.setState({ confirmTransaction: confirmTransactionSpy });

		// Capture both tap gestures in the order they're constructed: pill first,
		// then the row.
		const tapCallbacks: (() => void)[] = [];
		const originalTap = Gesture.Tap;
		Gesture.Tap = jest.fn().mockImplementation(() => ({
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

		Gesture.Tap = originalTap;
	});

	// KII-136: deleting a single occurrence of a recurring series. A virtual
	// (future) occurrence is a pure exclusion (no row to delete); a materialized
	// occurrence goes through the id-based scoped delete. These exercise the full
	// swipe → scope-alert → store-action wiring that the gesture E2E can't unit-check.
	describe('swipe-to-delete a recurring occurrence', () => {
		// Override Gesture.Pan to capture its onUpdate/onEnd so a test can simulate a
		// full left-swipe past the delete threshold.
		const installPanCapture = () => {
			const captured: {
				onUpdate?: (e: { translationX: number }) => void;
				onEnd?: () => void;
			} = {};
			const originalPan = Gesture.Pan;
			Gesture.Pan = jest.fn().mockReturnValue({
				activeOffsetX() {
					return this;
				},
				onUpdate(cb: (e: { translationX: number }) => void) {
					captured.onUpdate = cb;
					return this;
				},
				onEnd(cb: () => void) {
					captured.onEnd = cb;
					return this;
				},
			});
			return { captured, restore: () => (Gesture.Pan = originalPan) };
		};

		// Drag left past DELETE_THRESHOLD (-80) and release.
		const swipeToDelete = (captured: {
			onUpdate?: (e: { translationX: number }) => void;
			onEnd?: () => void;
		}) => {
			act(() => {
				captured.onUpdate?.({ translationX: -100 });
				captured.onEnd?.();
			});
		};

		afterEach(() => {
			(Alert.alert as jest.Mock | undefined)?.mockRestore?.();
		});

		it('materialized occurrence: "This one only" calls deleteTransactionWithScope(single)', () => {
			const deleteTransactionWithScope = jest.fn().mockResolvedValue(undefined);
			const excludeOccurrence = jest.fn().mockResolvedValue(undefined);
			const materializeOccurrence = jest.fn().mockResolvedValue(undefined);
			useStore.setState({
				deleteTransactionWithScope,
				excludeOccurrence,
				materializeOccurrence,
			});

			jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
				buttons?.find((b) => b.text === 'This one only')?.onPress?.();
			});

			const { restore, captured } = installPanCapture();
			render(
				<TransactionRow
					transaction={{ ...transaction, series_id: 'series-1' }}
					entityMap={entityMap}
					onEdit={jest.fn()}
					index={0}
				/>
			);

			swipeToDelete(captured);

			expect(deleteTransactionWithScope).toHaveBeenCalledWith('tx-1', 'single');
			expect(excludeOccurrence).not.toHaveBeenCalled();
			expect(materializeOccurrence).not.toHaveBeenCalled();

			restore();
		});

		it('virtual occurrence: "This one only" records an exclusion without deleting a row', () => {
			const deleteTransactionWithScope = jest.fn().mockResolvedValue(undefined);
			const excludeOccurrence = jest.fn().mockResolvedValue(undefined);
			const materializeOccurrence = jest.fn().mockResolvedValue(undefined);
			useStore.setState({
				deleteTransactionWithScope,
				excludeOccurrence,
				materializeOccurrence,
			});

			jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
				buttons?.find((b) => b.text === 'This one only')?.onPress?.();
			});

			const virtualOccurrence: Transaction = {
				...transaction,
				series_id: 'series-1',
				isVirtual: true,
			};
			const { restore, captured } = installPanCapture();
			render(
				<TransactionRow
					transaction={virtualOccurrence}
					entityMap={entityMap}
					onEdit={jest.fn()}
					index={0}
				/>
			);

			swipeToDelete(captured);

			expect(excludeOccurrence).toHaveBeenCalledWith(virtualOccurrence);
			expect(deleteTransactionWithScope).not.toHaveBeenCalled();
			expect(materializeOccurrence).not.toHaveBeenCalled();

			restore();
		});
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

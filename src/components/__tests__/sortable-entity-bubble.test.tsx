import React from 'react';
import { render } from '@testing-library/react-native';

import { SortableEntityBubble } from '../sortable-entity-bubble';
import { ENTITY_BUBBLE_NAME_LINES } from '@/src/constants/entities';
import type { EntityWithBalance } from '@/src/types';

let latestHandleMode: 'draggable' | 'fixed-order' | 'non-draggable' | undefined;
let latestTouchableProps:
	| {
			onTap?: () => void;
			onTouchesDown?: () => void;
			onTouchesUp?: () => void;
	  }
	| undefined;

jest.mock('react-native-sortables', () => {
	const { Pressable, View } = jest.requireActual('react-native');

	return {
		__esModule: true,
		default: {
			Handle: ({
				children,
				mode,
			}: {
				children: React.ReactNode;
				mode?: 'draggable' | 'fixed-order' | 'non-draggable';
			}) => {
				latestHandleMode = mode;
				return <View>{children}</View>;
			},
			Touchable: ({
				children,
				onTap,
				onTouchesDown,
				onTouchesUp,
			}: {
				children: React.ReactNode;
				onTap?: () => void;
				onTouchesDown?: () => void;
				onTouchesUp?: () => void;
			}) => {
				latestTouchableProps = { onTap, onTouchesDown, onTouchesUp };
				return <Pressable onPress={onTap}>{children}</Pressable>;
			},
		},
	};
});

jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-worklets', () => ({
	scheduleOnRN: jest.fn(),
}));

jest.mock('react-native-reanimated', () => {
	const { View } = jest.requireActual('react-native');

	return {
		__esModule: true,
		default: { View },
		useAnimatedStyle: () => ({}),
		useSharedValue: (value: number) => ({ value }),
		withTiming: (value: number) => value,
		withSpring: (value: number) => value,
		useAnimatedReaction: jest.fn(),
	};
});

jest.mock('../circular-progress', () => ({
	CircularProgress: () => null,
}));

jest.mock('@/src/constants/icon-registry', () => ({
	getIcon: () => () => null,
}));

describe('SortableEntityBubble', () => {
	const entity: EntityWithBalance = {
		id: 'saving-1',
		type: 'saving',
		name: 'Emergency fund buffer',
		currency: 'EUR',
		icon: 'shield',
		order: 0,
		row: 0,
		position: 0,
		actual: 1200,
		planned: 5000,
		remaining: 3800,
		upcoming: 0,
		reserved: 1200,
	};

	beforeEach(() => {
		latestHandleMode = undefined;
		latestTouchableProps = undefined;
	});

	it('allows entity names to wrap to two lines on dashboard bubbles', () => {
		const { getByText } = render(<SortableEntityBubble entity={entity} />);
		const label = getByText(entity.name);

		expect(label.props.numberOfLines).toBe(ENTITY_BUBBLE_NAME_LINES);
		expect(label.props.ellipsizeMode).toBe('tail');
		expect(label.props.style).toEqual(expect.objectContaining({ lineHeight: 14 }));
	});

	it('starts all bubbles as draggable (grid controls fixed-order via context)', () => {
		render(<SortableEntityBubble entity={entity} />);

		expect(latestHandleMode).toBe('draggable');
		// No touch-down/up mode flip — activation race eliminated
		expect(latestTouchableProps?.onTouchesDown).toBeUndefined();
		expect(latestTouchableProps?.onTouchesUp).toBeUndefined();
	});

	describe('Income bubble display', () => {
		const incomeEntity: EntityWithBalance = {
			id: 'income-1',
			type: 'income',
			name: 'Salary',
			currency: 'EUR',
			icon: 'briefcase',
			order: 0,
			row: 0,
			position: 0,
			actual: 3000,
			planned: 5000,
			remaining: 2000,
			upcoming: 0,
		};

		it('shows actual amount instead of remaining', () => {
			const { getByText } = render(<SortableEntityBubble entity={incomeEntity} />);

			// Should show actual (3,000.00), not remaining (2,000.00)
			expect(getByText('3,000.00')).toBeTruthy();
		});

		it('shows red text when actual is below planned', () => {
			const { getByText } = render(<SortableEntityBubble entity={incomeEntity} />);

			const amountText = getByText('3,000.00');
			expect(amountText.props.className).toContain('text-negative');
		});

		it('shows green text when actual meets planned', () => {
			const metTarget = { ...incomeEntity, actual: 5000, remaining: 0 };
			const { getAllByText } = render(<SortableEntityBubble entity={metTarget} />);

			// Both main and planned show 5,000.00; main amount is the first (semibold)
			const matches = getAllByText('5,000.00');
			const mainAmount = matches.find((el) =>
				el.props.className?.includes('font-sans-semibold')
			);
			expect(mainAmount?.props.className).toContain('text-positive');
		});

		it('shows green text when actual exceeds planned', () => {
			const exceededTarget = { ...incomeEntity, actual: 6000, remaining: -1000 };
			const { getByText } = render(<SortableEntityBubble entity={exceededTarget} />);

			const amountText = getByText('6,000.00');
			expect(amountText.props.className).toContain('text-positive');
		});

		it('shows default ink color when no plan is set', () => {
			const noPlan = { ...incomeEntity, planned: 0, remaining: -3000 };
			const { getByText } = render(<SortableEntityBubble entity={noPlan} />);

			const amountText = getByText('3,000.00');
			expect(amountText.props.className).toContain('text-ink');
			expect(amountText.props.className).not.toContain('text-negative');
			expect(amountText.props.className).not.toContain('text-positive');
		});

		it('clamps negative actual to zero', () => {
			const negativeActual = { ...incomeEntity, actual: -100, remaining: 5100 };
			const { getByText } = render(<SortableEntityBubble entity={negativeActual} />);

			expect(getByText('0.00')).toBeTruthy();
		});
	});

	describe('Account bubble display', () => {
		const accountEntity: EntityWithBalance = {
			id: 'account-1',
			type: 'account',
			name: 'Main account',
			currency: 'EUR',
			icon: 'wallet',
			order: 0,
			row: 0,
			position: 0,
			actual: 3800,
			planned: 0,
			remaining: -3800,
			upcoming: 0,
			reserved: 1000,
		};

		it('shows actual balance, not actual minus reserved', () => {
			const { getByText } = render(<SortableEntityBubble entity={accountEntity} />);

			// Main amount should be actual (3,800.00), NOT actual - reserved (2,800.00)
			expect(getByText('3,800.00')).toBeTruthy();
		});

		it('shows total (actual + reserved) when reserved > 0', () => {
			const { getByText } = render(<SortableEntityBubble entity={accountEntity} />);

			// Subtitle: actual + reserved = 3800 + 1000 = 4800
			expect(getByText('4,800.00 total')).toBeTruthy();
		});

		it('shows red text when actual is negative', () => {
			const negative = { ...accountEntity, actual: -200, remaining: 200 };
			const { getByText } = render(<SortableEntityBubble entity={negative} />);

			const amountText = getByText('-200.00');
			expect(amountText.props.className).toContain('text-negative');
		});
	});

	describe('Investment account bubble display', () => {
		const investmentEntity: EntityWithBalance = {
			id: 'inv-1',
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

		it('shows purchased price (actual) as main amount', () => {
			const { getByText } = render(<SortableEntityBubble entity={investmentEntity} />);

			expect(getByText('5,000.00')).toBeTruthy();
		});

		it('shows latest market value as secondary line', () => {
			const { getByText } = render(<SortableEntityBubble entity={investmentEntity} />);

			expect(getByText('7,500.00')).toBeTruthy();
		});

		it('hides reserved total line for investment accounts', () => {
			const withReserved = { ...investmentEntity, reserved: 2000 };
			const { queryByText } = render(<SortableEntityBubble entity={withReserved} />);

			expect(queryByText(/total/)).toBeNull();
		});

		it('shows nothing as secondary when no market value snapshot exists', () => {
			const noSnapshot = { ...investmentEntity, latestMarketValue: null };
			const { queryByText } = render(<SortableEntityBubble entity={noSnapshot} />);

			// Should not show any secondary amount text
			const secondaryTexts = queryByText(/7,500\.00/);
			expect(secondaryTexts).toBeNull();
		});
	});
});

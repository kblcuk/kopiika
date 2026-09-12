import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { QuickAddMenu } from '../quick-add-menu';
import { QUICK_ADD_KINDS } from '@/src/utils/quick-add-kinds';
import { setupStoreForTest } from '@/src/test-utils-component';
import type { Entity, EntityType } from '@/src/types';
import { TestIDs } from '@/e2e/support/test-ids';

const noop = () => {};

let seq = 0;
const entity = (type: EntityType, name: string): Entity => {
	seq += 1;
	return { id: `${type}-${seq}`, type, name, currency: 'EUR', row: 0, position: seq };
};

// A board every kind can be carried out on.
const fullBoard = () => [
	entity('income', 'Salary'),
	entity('account', 'Main Card'),
	entity('account', 'Cash'),
	entity('category', 'Groceries'),
	entity('saving', 'Trip to Japan'),
];

describe('QuickAddMenu', () => {
	beforeEach(() => {
		setupStoreForTest({ entities: fullBoard() });
	});

	it('lists every quick-add kind with its label and hint', () => {
		const { getByText } = render(
			<QuickAddMenu visible anchorBottom={80} onSelect={noop} onClose={noop} />
		);

		for (const kind of QUICK_ADD_KINDS) {
			expect(getByText(kind.label)).toBeTruthy();
			expect(getByText(kind.hint)).toBeTruthy();
		}
	});

	it('reports the kind that was tapped', () => {
		const onSelect = jest.fn();
		const { getByTestId } = render(
			<QuickAddMenu visible anchorBottom={80} onSelect={onSelect} onClose={noop} />
		);

		fireEvent.press(getByTestId(TestIDs.quickAddMenu.option('income')));

		expect(onSelect).toHaveBeenCalledWith('income');
	});

	it('closes when the backdrop is tapped', () => {
		const onClose = jest.fn();
		const { getByTestId } = render(
			<QuickAddMenu visible anchorBottom={80} onSelect={noop} onClose={onClose} />
		);

		fireEvent.press(getByTestId(TestIDs.quickAddMenu.backdrop));

		expect(onClose).toHaveBeenCalled();
	});

	it('renders nothing while closed', () => {
		const { queryByTestId } = render(
			<QuickAddMenu visible={false} anchorBottom={80} onSelect={noop} onClose={noop} />
		);

		expect(queryByTestId(TestIDs.quickAddMenu.card)).toBeNull();
	});

	it('anchors the card above the measured button', () => {
		const { getByTestId } = render(
			<QuickAddMenu visible anchorBottom={80} onSelect={noop} onClose={noop} />
		);

		// The card grows upward from the button, so it is positioned by its
		// distance from the bottom of the window rather than by a top offset —
		// a hardcoded tab-bar height would drift across devices.
		const style = getByTestId(TestIDs.quickAddMenu.card).props.style;
		const flat = Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
		expect(flat.bottom).toBeGreaterThan(0);
		expect(flat.top).toBeUndefined();
	});

	describe('rows the board cannot carry out', () => {
		// Only one account, and nothing to receive from it but a category: the
		// board can spend, and nothing else.
		const spendOnlyBoard = () => [entity('account', 'Main Card'), entity('category', 'Rent')];

		it('marks them disabled and leaves the rest usable', () => {
			setupStoreForTest({ entities: spendOnlyBoard() });
			const { getByTestId } = render(
				<QuickAddMenu visible anchorBottom={80} onSelect={noop} onClose={noop} />
			);

			expect(
				getByTestId(TestIDs.quickAddMenu.option('expense')).props.accessibilityState
					?.disabled
			).toBeFalsy();
			for (const key of ['income', 'transfer', 'reserve'] as const) {
				expect(
					getByTestId(TestIDs.quickAddMenu.option(key)).props.accessibilityState?.disabled
				).toBe(true);
			}
		});

		it('does not report a tap on one', () => {
			setupStoreForTest({ entities: spendOnlyBoard() });
			const onSelect = jest.fn();
			const { getByTestId } = render(
				<QuickAddMenu visible anchorBottom={80} onSelect={onSelect} onClose={noop} />
			);

			fireEvent.press(getByTestId(TestIDs.quickAddMenu.option('reserve')));

			expect(onSelect).not.toHaveBeenCalled();
		});

		it('still lists them, so the menu keeps its shape on an empty board', () => {
			setupStoreForTest({ entities: [] });
			const { getByTestId } = render(
				<QuickAddMenu visible anchorBottom={80} onSelect={noop} onClose={noop} />
			);

			for (const kind of QUICK_ADD_KINDS) {
				expect(getByTestId(TestIDs.quickAddMenu.option(kind.key))).toBeTruthy();
			}
		});
	});
});

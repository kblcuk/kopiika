import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { StepReview } from '../bank-import/step-review';
import type { ReconciledRow } from '@/src/utils/bank-import/types';
import type { Entity, EntityDraft } from '@/src/types';

// StepReview renders EntityCreateModal (for new-category creation), which pulls
// in expo-router via InfoPin; stub the native-only deps so jest can load it.
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	notificationAsync: jest.fn(),
	selectionAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
	NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: jest.fn() }),
}));

const cat: Entity = {
	id: 'cat-1',
	type: 'category',
	name: 'Groceries',
	currency: 'EUR',
	row: 0,
	position: 0,
};

function newRow(rowIndex: number, amountMinor: number): ReconciledRow {
	return {
		parsed: {
			rowIndex,
			dateMs: new Date(2026, 6, 12).getTime(),
			amountMinor,
			description: `r${rowIndex}`,
		},
		status: 'new',
		selected: true,
		assignment: null,
	};
}

describe('StepReview', () => {
	it('disables commit while a selected new row is unassigned', () => {
		const rows = [newRow(0, -100)];
		const { getByTestId } = render(
			<StepReview
				rows={rows}
				onRowsChange={() => {}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {}}
				committing={false}
			/>
		);
		expect(getByTestId('import-review-confirm').props.accessibilityState?.disabled).toBe(true);
	});

	it('enables commit once every selected new row is assigned', () => {
		const rows = [
			{ ...newRow(0, -100), assignment: { kind: 'category', entityId: 'cat-1' } as const },
		];
		let committed = false;
		const { getByTestId } = render(
			<StepReview
				rows={rows}
				onRowsChange={() => {}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {
					committed = true;
				}}
				committing={false}
			/>
		);
		fireEvent.press(getByTestId('import-review-confirm'));
		expect(committed).toBe(true);
	});

	function dupRow(rowIndex: number, amountMinor: number, selected: boolean): ReconciledRow {
		return {
			parsed: {
				rowIndex,
				dateMs: new Date(2026, 6, 12).getTime(),
				amountMinor,
				description: `r${rowIndex}`,
			},
			status: 'duplicate',
			selected,
			assignment: null,
		};
	}

	it('counts a ticked duplicate toward the import once it has an assignment', () => {
		const rows = [
			{ ...newRow(0, -100), assignment: { kind: 'category', entityId: 'cat-1' } as const },
			{
				...dupRow(1, -500, true),
				assignment: { kind: 'category', entityId: 'cat-1' } as const,
			},
		];
		const { getByText, queryByText } = render(
			<StepReview
				rows={rows}
				onRowsChange={() => {}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {}}
				committing={false}
			/>
		);
		expect(getByText('Import 2 transactions')).toBeTruthy();
		expect(queryByText('Import 1 transaction')).toBeNull();
	});

	it('blocks commit while a ticked duplicate is still unassigned', () => {
		const rows = [
			{ ...newRow(0, -100), assignment: { kind: 'category', entityId: 'cat-1' } as const },
			dupRow(1, -500, true),
		];
		const { getByTestId } = render(
			<StepReview
				rows={rows}
				onRowsChange={() => {}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {}}
				committing={false}
			/>
		);
		expect(getByTestId('import-review-confirm').props.accessibilityState?.disabled).toBe(true);
	});

	it('offers a category picker on a duplicate only once it is ticked', () => {
		const rows = [dupRow(1, -500, false)];
		const { queryByTestId, rerender } = render(
			<StepReview
				rows={rows}
				onRowsChange={() => {}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {}}
				committing={false}
			/>
		);
		expect(queryByTestId('import-review-assign-1')).toBeNull();
		rerender(
			<StepReview
				rows={[dupRow(1, -500, true)]}
				onRowsChange={() => {}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {}}
				committing={false}
			/>
		);
		expect(queryByTestId('import-review-assign-1')).toBeTruthy();
	});

	it('select-all toggles every new row selected via onRowsChange', () => {
		const rows = [
			{ ...newRow(0, -100), selected: false },
			{ ...newRow(1, -200), selected: false },
		];
		let updated: ReconciledRow[] | null = null;
		const { getByTestId, getByText } = render(
			<StepReview
				rows={rows}
				onRowsChange={(r) => {
					updated = r;
				}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {}}
				committing={false}
			/>
		);
		// Both deselected → control offers "Select all".
		expect(getByText('Select all')).toBeTruthy();
		fireEvent.press(getByTestId('import-review-select-all'));
		expect(updated).not.toBeNull();
		expect(updated!.every((r) => r.selected)).toBe(true);
	});

	it('offers a category staged earlier in the import when categorizing a later row', () => {
		const coffeeDraft: EntityDraft = {
			type: 'category',
			name: 'Coffee',
			icon: 'cup',
			color: null,
			isInvestment: false,
			plannedAmountMinor: null,
		};
		const rows = [
			{
				...newRow(0, -100),
				assignment: { kind: 'newCategory', draft: coffeeDraft } as const,
			},
			newRow(1, -200), // unassigned — categorizing it should see the staged "Coffee"
		];
		const { getByTestId, queryByTestId } = render(
			<StepReview
				rows={rows}
				onRowsChange={() => {}}
				categories={[cat]}
				incomes={[]}
				accounts={[]}
				currency="EUR"
				onCommit={() => {}}
				committing={false}
			/>
		);
		// Sheet is closed → staged option not mounted yet.
		expect(queryByTestId('entity-option-Coffee')).toBeNull();
		// Open the category picker for the still-unassigned row.
		fireEvent.press(getByTestId('import-review-assign-1'));
		// Both the real category and the staged one are selectable.
		expect(getByTestId('entity-option-Groceries')).toBeTruthy();
		expect(getByTestId('entity-option-Coffee')).toBeTruthy();
	});
});

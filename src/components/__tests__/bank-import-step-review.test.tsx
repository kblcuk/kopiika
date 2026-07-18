import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { StepReview } from '../bank-import/step-review';
import type { ReconciledRow } from '@/src/utils/bank-import/types';
import type { Entity } from '@/src/types';

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

	it('excludes selected duplicate rows from the displayed import count', () => {
		const dupRow: ReconciledRow = {
			parsed: {
				rowIndex: 1,
				dateMs: new Date(2026, 6, 12).getTime(),
				amountMinor: -500,
				description: 'r1',
			},
			status: 'duplicate',
			selected: true, // ticked, but duplicates never commit
			assignment: null,
		};
		const rows = [
			{ ...newRow(0, -100), assignment: { kind: 'category', entityId: 'cat-1' } as const },
			dupRow,
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
		expect(getByText('Import 1 transaction')).toBeTruthy();
		expect(queryByText('Import 2 transactions')).toBeNull();
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
});

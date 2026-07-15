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
});

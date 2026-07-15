import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { StepMapColumns } from '../bank-import/step-map-columns';
import type { ColumnMapping } from '@/src/utils/bank-import/types';

const mapping: ColumnMapping = {
	delimiter: ',',
	hasHeader: true,
	dateColumn: 0,
	dateFormat: 'YYYY-MM-DD',
	decimalSeparator: '.',
	amount: { kind: 'signed', column: 2 },
	descriptionColumn: 1,
};
const csv = `Date,Description,Amount\n2026-07-12,ATB,-250.00`;

describe('StepMapColumns', () => {
	it('shows a parsed preview row for the current mapping', () => {
		const { getByText } = render(
			<StepMapColumns
				rawText={csv}
				mapping={mapping}
				headers={['Date', 'Description', 'Amount']}
				onChange={() => {}}
				onConfirm={() => {}}
			/>
		);
		expect(getByText('ATB')).toBeTruthy();
	});

	it('fires onConfirm when the user taps continue', () => {
		let confirmed = false;
		const { getByTestId } = render(
			<StepMapColumns
				rawText={csv}
				mapping={mapping}
				headers={['Date', 'Description', 'Amount']}
				onChange={() => {}}
				onConfirm={() => {
					confirmed = true;
				}}
			/>
		);
		fireEvent.press(getByTestId('import-mapping-next'));
		expect(confirmed).toBe(true);
	});
});

import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';

import { AllocationPieChart, type AllocationPieSlice } from '../allocation-pie-chart';

const slices: AllocationPieSlice[] = [
	{
		id: 'groceries',
		label: 'Groceries',
		value: 75,
		color: '#2F7D4A',
	},
	{
		id: 'coffee',
		label: 'Coffee',
		value: 25,
		color: '#D4652F',
	},
];

describe('AllocationPieChart', () => {
	it('selects on first tap, clears from the center, and fires on second tap', () => {
		const onSlicePress = jest.fn();
		const { getByTestId } = render(
			<AllocationPieChart
				slices={slices}
				currency="EUR"
				totalLabel="Categories"
				onSlicePress={onSlicePress}
			/>
		);

		fireEvent.press(getByTestId('allocation-pie-chart-legend-groceries'));

		expect(onSlicePress).not.toHaveBeenCalled();
		expect(
			within(getByTestId('allocation-pie-chart-clear-selection')).getByText('75%')
		).toBeTruthy();

		fireEvent.press(getByTestId('allocation-pie-chart-clear-selection'));

		expect(
			within(getByTestId('allocation-pie-chart-clear-selection')).queryByText('75%')
		).toBeNull();

		fireEvent.press(getByTestId('allocation-pie-chart-slice-groceries'));
		fireEvent.press(getByTestId('allocation-pie-chart-slice-groceries'));

		expect(onSlicePress).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'groceries',
				label: 'Groceries',
				value: 75,
			})
		);
	});

	it('treats a missing active slice as unselected after data changes', () => {
		const onSlicePress = jest.fn();
		const { getByTestId, rerender } = render(
			<AllocationPieChart
				slices={slices}
				currency="EUR"
				totalLabel="Categories"
				onSlicePress={onSlicePress}
			/>
		);

		fireEvent.press(getByTestId('allocation-pie-chart-legend-groceries'));

		expect(
			within(getByTestId('allocation-pie-chart-clear-selection')).getByText('75%')
		).toBeTruthy();

		rerender(
			<AllocationPieChart
				slices={[slices[1]]}
				currency="EUR"
				totalLabel="Categories"
				onSlicePress={onSlicePress}
			/>
		);

		expect(
			within(getByTestId('allocation-pie-chart-clear-selection')).queryByText('75%')
		).toBeNull();

		fireEvent.press(getByTestId('allocation-pie-chart-legend-coffee'));

		expect(onSlicePress).not.toHaveBeenCalled();
		expect(
			within(getByTestId('allocation-pie-chart-clear-selection')).getByText('100%')
		).toBeTruthy();
	});
});

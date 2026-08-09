import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { DateQuickPresets, type DatePreset } from '../date-quick-presets';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

const options: DatePreset[] = [
	{ key: 'today', label: 'Today', date: at(2026, 8, 9) },
	{ key: 'yesterday', label: 'Yesterday', date: at(2026, 8, 8) },
];

describe('DateQuickPresets', () => {
	it('renders a chip per option', () => {
		const { getByTestId, getByText } = render(
			<DateQuickPresets
				options={options}
				value={at(2026, 8, 9)}
				onSelect={jest.fn()}
				testIDPrefix="date-preset"
			/>
		);

		expect(getByTestId('date-preset-today')).toBeTruthy();
		expect(getByTestId('date-preset-yesterday')).toBeTruthy();
		expect(getByText('Yesterday')).toBeTruthy();
	});

	it('marks the chip matching value as selected', () => {
		const { getByTestId } = render(
			<DateQuickPresets
				options={options}
				value={at(2026, 8, 8)}
				onSelect={jest.fn()}
				testIDPrefix="date-preset"
			/>
		);

		expect(getByTestId('date-preset-yesterday').props.accessibilityState.selected).toBe(true);
		expect(getByTestId('date-preset-today').props.accessibilityState.selected).toBe(false);
	});

	it('matches on the civil day, ignoring time-of-day', () => {
		const { getByTestId } = render(
			<DateQuickPresets
				options={options}
				value={at(2026, 8, 9, 23, 59)}
				onSelect={jest.fn()}
				testIDPrefix="date-preset"
			/>
		);

		expect(getByTestId('date-preset-today').props.accessibilityState.selected).toBe(true);
	});

	it('selects nothing when value matches no option', () => {
		const { getByTestId } = render(
			<DateQuickPresets
				options={options}
				value={at(2026, 7, 1)}
				onSelect={jest.fn()}
				testIDPrefix="date-preset"
			/>
		);

		expect(getByTestId('date-preset-today').props.accessibilityState.selected).toBe(false);
		expect(getByTestId('date-preset-yesterday').props.accessibilityState.selected).toBe(false);
	});

	it('calls onSelect with the pressed option date', () => {
		const onSelect = jest.fn();
		const { getByTestId } = render(
			<DateQuickPresets
				options={options}
				value={at(2026, 8, 9)}
				onSelect={onSelect}
				testIDPrefix="date-preset"
			/>
		);

		fireEvent.press(getByTestId('date-preset-yesterday'));

		expect(onSelect).toHaveBeenCalledWith(at(2026, 8, 8));
	});

	it('still fires onSelect when the selected chip is pressed (not a toggle)', () => {
		const onSelect = jest.fn();
		const { getByTestId } = render(
			<DateQuickPresets
				options={options}
				value={at(2026, 8, 9)}
				onSelect={onSelect}
				testIDPrefix="date-preset"
			/>
		);

		fireEvent.press(getByTestId('date-preset-today'));

		expect(onSelect).toHaveBeenCalledWith(at(2026, 8, 9));
	});
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { EntityColorPicker } from '../entity-color-picker';

jest.mock('lucide-react-native', () => {
	const { Text } = jest.requireActual('react-native');
	return {
		Check: (props: { testID?: string }) => <Text testID={props.testID}>✓</Text>,
	};
});

describe('EntityColorPicker', () => {
	const onSelect = jest.fn();

	beforeEach(() => {
		onSelect.mockClear();
	});

	it('renders 9 dots (1 default + 8 palette)', () => {
		const { getAllByTestId } = render(
			<EntityColorPicker entityType="income" selectedColor={null} onSelect={onSelect} />,
		);
		const dots = getAllByTestId(/^color-dot-/);
		expect(dots).toHaveLength(9);
	});

	it('selects the default dot when color is null', () => {
		const { getByTestId } = render(
			<EntityColorPicker entityType="income" selectedColor={null} onSelect={onSelect} />,
		);
		expect(getByTestId('color-check-default')).toBeTruthy();
	});

	it('selects the correct palette dot when color is set', () => {
		const { getByTestId, queryByTestId } = render(
			<EntityColorPicker entityType="income" selectedColor="emerald" onSelect={onSelect} />,
		);
		expect(getByTestId('color-check-emerald')).toBeTruthy();
		expect(queryByTestId('color-check-default')).toBeNull();
	});

	it('calls onSelect with null when default dot is tapped', () => {
		const { getByTestId } = render(
			<EntityColorPicker entityType="income" selectedColor="emerald" onSelect={onSelect} />,
		);
		fireEvent.press(getByTestId('color-dot-default'));
		expect(onSelect).toHaveBeenCalledWith(null);
	});

	it('calls onSelect with key when palette dot is tapped', () => {
		const { getByTestId } = render(
			<EntityColorPicker entityType="income" selectedColor={null} onSelect={onSelect} />,
		);
		fireEvent.press(getByTestId('color-dot-sapphire'));
		expect(onSelect).toHaveBeenCalledWith('sapphire');
	});

	it('does not call onSelect when already-selected dot is tapped', () => {
		const { getByTestId } = render(
			<EntityColorPicker entityType="income" selectedColor={null} onSelect={onSelect} />,
		);
		fireEvent.press(getByTestId('color-dot-default'));
		expect(onSelect).not.toHaveBeenCalled();
	});
});

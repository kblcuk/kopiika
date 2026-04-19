import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SheetHeader } from '../sheet-header';

describe('SheetHeader', () => {
	const mockOnClose = jest.fn();

	beforeEach(() => jest.clearAllMocks());

	it('renders a grabber pill', () => {
		const { getByTestId } = render(<SheetHeader onClose={mockOnClose} />);
		expect(getByTestId('sheet-grabber')).toBeTruthy();
	});

	it('renders a close button that calls onClose', () => {
		const { getByTestId } = render(<SheetHeader onClose={mockOnClose} />);
		fireEvent.press(getByTestId('sheet-close'));
		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});
});

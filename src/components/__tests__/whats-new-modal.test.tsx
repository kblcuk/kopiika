import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WhatsNewModal } from '../whats-new-modal';
import { getLatestChangelog } from '@/src/utils/changelog';

jest.mock('@/src/utils/changelog');

const mockedGetLatestChangelog = getLatestChangelog as jest.Mock;

const mockChangelog = {
	version: '0.3.0',
	date: '2026-03-15',
	sections: [
		{
			type: 'Features',
			items: ['Telegram release notifications', 'In-app changelog modal'],
		},
		{
			type: 'Bug Fixes',
			items: ['Fix amount rounding in reservations'],
		},
	],
};

describe('WhatsNewModal', () => {
	const mockOnClose = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		mockedGetLatestChangelog.mockReturnValue(mockChangelog);
	});

	it('renders version header and changelog sections', () => {
		const { getByText } = render(<WhatsNewModal visible={true} onClose={mockOnClose} />);

		expect(getByText("What's New")).toBeTruthy();
		expect(getByText('Version 0.3.0')).toBeTruthy();

		// Section labels: Features → "New", Bug Fixes → "Fixed"
		expect(getByText('New')).toBeTruthy();
		expect(getByText('Fixed')).toBeTruthy();

		// Individual items
		expect(getByText('Telegram release notifications')).toBeTruthy();
		expect(getByText('In-app changelog modal')).toBeTruthy();
		expect(getByText('Fix amount rounding in reservations')).toBeTruthy();
	});

	it('returns null when no changelog available', () => {
		mockedGetLatestChangelog.mockReturnValue(null);

		const { toJSON } = render(<WhatsNewModal visible={true} onClose={mockOnClose} />);

		expect(toJSON()).toBeNull();
	});

	it('calls onClose when dismiss button pressed', () => {
		const { getByTestId } = render(<WhatsNewModal visible={true} onClose={mockOnClose} />);

		fireEvent.press(getByTestId('whats-new-dismiss'));

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it('calls onClose when backdrop pressed', () => {
		const { getByTestId } = render(<WhatsNewModal visible={true} onClose={mockOnClose} />);

		fireEvent.press(getByTestId('whats-new-backdrop'));

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it('falls back to raw type name for unknown section types', () => {
		mockedGetLatestChangelog.mockReturnValue({
			...mockChangelog,
			sections: [{ type: 'Refactoring', items: ['Simplify store selectors'] }],
		});

		const { getByText } = render(<WhatsNewModal visible={true} onClose={mockOnClose} />);

		// No mapping for "Refactoring" — rendered as-is
		expect(getByText('Refactoring')).toBeTruthy();
		expect(getByText('Simplify store selectors')).toBeTruthy();
	});
});

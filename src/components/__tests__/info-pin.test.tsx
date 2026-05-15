import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { InfoPin } from '../info-pin';
import { TestIDs } from '@/e2e/support/test-ids';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
}));

describe('InfoPin', () => {
	beforeEach(() => mockPush.mockClear());

	it('pushes /help/[articleId] when tapped', () => {
		const { getByTestId } = render(<InfoPin articleId="reservations" />);
		fireEvent.press(getByTestId(TestIDs.infoPin('reservations')));
		expect(mockPush).toHaveBeenCalledWith({
			pathname: '/help/[articleId]',
			params: { articleId: 'reservations' },
		});
	});
});

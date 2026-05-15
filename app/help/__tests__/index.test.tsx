import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import HelpIndexScreen from '../index';
import { KB_ARTICLES } from '@/src/kb/articles';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Help index screen', () => {
	beforeEach(() => mockPush.mockClear());

	it('renders every article title', () => {
		const { getByText } = render(<HelpIndexScreen />);
		for (const article of KB_ARTICLES) {
			expect(getByText(article.title)).toBeTruthy();
		}
	});

	it('filters by search input substring (case-insensitive)', () => {
		const { getByTestId, queryByText } = render(<HelpIndexScreen />);
		fireEvent.changeText(getByTestId('help-search-input'), 'recurring');
		expect(queryByText('Recurring transactions')).toBeTruthy();
		expect(queryByText('Reservations')).toBeNull();
	});

	it('navigates to the article on tap', () => {
		const { getByTestId } = render(<HelpIndexScreen />);
		fireEvent.press(getByTestId('help-article-row-core-loop'));
		expect(mockPush).toHaveBeenCalledWith({
			pathname: '/help/[articleId]',
			params: { articleId: 'core-loop' },
		});
	});
});

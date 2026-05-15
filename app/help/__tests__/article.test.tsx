import React from 'react';
import { render } from '@testing-library/react-native';

import ArticleScreen from '../[articleId]';

const mockBack = jest.fn();
let mockSearchParams: { articleId?: string } = {};

jest.mock('expo-router', () => ({
	useRouter: () => ({ back: mockBack, push: jest.fn() }),
	useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Help article screen', () => {
	beforeEach(() => mockBack.mockClear());

	it('renders the requested article body', () => {
		mockSearchParams = { articleId: 'core-loop' };
		const { getByText } = render(<ArticleScreen />);
		expect(getByText('The core loop')).toBeTruthy();
	});

	it('renders a not-found message for unknown ids', () => {
		mockSearchParams = { articleId: 'does-not-exist' };
		const { getByText } = render(<ArticleScreen />);
		expect(getByText(/not found/i)).toBeTruthy();
	});
});

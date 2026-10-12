import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import WelcomeScreen from '../welcome';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/utils/app-prefs');
const mockedSet = jest.mocked(setHasCompletedOnboarding);

describe('Onboarding welcome screen', () => {
	beforeEach(() => {
		mockPush.mockClear();
		mockReplace.mockClear();
		mockedSet.mockClear();
	});

	it('opens practice when continue is tapped', () => {
		const { getByTestId } = render(<WelcomeScreen />);
		fireEvent.press(getByTestId('onboarding-welcome-continue'));
		expect(mockPush).toHaveBeenCalledWith('/onboarding/practice');
	});

	it('can bypass practice and start personal setup', () => {
		const ui = render(<WelcomeScreen />);
		fireEvent.press(ui.getByTestId('onboarding-welcome-setup'));
		expect(mockPush).toHaveBeenCalledWith('/onboarding/setup');
	});

	it('marks onboarding complete and replaces to (tabs) when skip is tapped', async () => {
		const { getByTestId } = render(<WelcomeScreen />);
		fireEvent.press(getByTestId('onboarding-welcome-skip'));
		await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(true));
		expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
	});
});

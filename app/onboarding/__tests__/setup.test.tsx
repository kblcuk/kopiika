import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

import SetupScreen from '../setup';
import { PRESET_CHIPS, presetKey } from '@/src/onboarding/presets';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';

const mockReplace = jest.fn();
let mockSearchParams: { fromSettings?: string } = {};

jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace }),
	useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockAddEntity = jest.fn(async () => {});
const mockSetPlan = jest.fn(async () => {});

type SetupStoreSlice = { addEntity: typeof mockAddEntity; setPlan: typeof mockSetPlan };

jest.mock('@/src/store', () => ({
	useStore: <T,>(selector?: (s: SetupStoreSlice) => T) => {
		const state: SetupStoreSlice = { addEntity: mockAddEntity, setPlan: mockSetPlan };
		return selector ? selector(state) : state;
	},
}));

jest.mock('@/src/utils/app-prefs');
const mockedSetHasCompleted = jest.mocked(setHasCompletedOnboarding);

describe('Onboarding setup screen', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSearchParams = {};
	});

	it('default-selects chips with defaultSelected=true', () => {
		const { getByTestId } = render(<SetupScreen />);
		const defaults = PRESET_CHIPS.filter((c) => c.defaultSelected);
		for (const chip of defaults) {
			const node = getByTestId(`onboarding-setup-chip-${presetKey(chip)}`);
			expect(node.props.accessibilityState?.selected).toBe(true);
		}
	});

	it('Continue writes selected chips + completion flag, then replaces to /(tabs)', async () => {
		const { getByTestId } = render(<SetupScreen />);
		await act(async () => {
			fireEvent.press(getByTestId('onboarding-setup-continue'));
		});
		await waitFor(() => {
			const defaultCount = PRESET_CHIPS.filter((c) => c.defaultSelected).length;
			expect(mockAddEntity).toHaveBeenCalledTimes(defaultCount);
			expect(mockSetPlan).toHaveBeenCalledTimes(defaultCount);
			expect(mockedSetHasCompleted).toHaveBeenCalledWith(true);
			expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
		});
	});

	it('Skip link writes completion flag without creating entities', async () => {
		const { getByTestId } = render(<SetupScreen />);
		await act(async () => {
			fireEvent.press(getByTestId('onboarding-setup-skip'));
		});
		await waitFor(() => {
			expect(mockAddEntity).not.toHaveBeenCalled();
			expect(mockSetPlan).not.toHaveBeenCalled();
			expect(mockedSetHasCompleted).toHaveBeenCalledWith(true);
			expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
		});
	});

	it('preview mode (fromSettings=true) disables chips and shows Done button', () => {
		mockSearchParams = { fromSettings: 'true' };
		const { getByTestId, getByText } = render(<SetupScreen />);
		expect(getByText(/this is what new users see/i)).toBeTruthy();
		const firstDefault = PRESET_CHIPS.find((c) => c.defaultSelected)!;
		const chipNode = getByTestId(`onboarding-setup-chip-${presetKey(firstDefault)}`);
		expect(chipNode.props.accessibilityState?.disabled).toBe(true);
		fireEvent.press(getByTestId('onboarding-setup-continue'));
		expect(mockReplace).toHaveBeenCalledWith('/(tabs)/settings');
		expect(mockAddEntity).not.toHaveBeenCalled();
	});
});

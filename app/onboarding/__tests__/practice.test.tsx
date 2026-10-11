import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PracticeScreen from '../practice';
import { setupStoreForTest } from '@/src/test-utils-component';
import { useStore } from '@/src/store';
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: { origin?: string } = {};
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: () => true }),
	useLocalSearchParams: () => mockParams,
	useFocusEffect: (fn: () => () => void) => jest.requireActual('react').useEffect(fn, [fn]),
}));
jest.mock('react-native-reanimated', () => {
	const { View, ScrollView } = jest.requireActual('react-native');
	return {
		__esModule: true,
		default: { View, ScrollView },
		useAnimatedRef: () => ({ current: null }),
		useSharedValue: (value: unknown) => ({ value }),
		useAnimatedStyle: () => ({}),
		useReducedMotion: () => true,
		withTiming: (value: unknown) => value,
	};
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));
jest.mock('react-native-sortables', () => ({
	__esModule: true,
	default: {
		Grid: () => null,
		Handle: ({ children }: { children: React.ReactNode }) => children,
		Touchable: ({ children }: { children: React.ReactNode }) => children,
	},
}));

beforeEach(() => {
	setupStoreForTest();
	mockReplace.mockClear();
	mockBack.mockClear();
	mockParams = {};
});
async function record(ui: ReturnType<typeof render>, amount: string, reservation = false) {
	fireEvent.press(ui.getByTestId('practice-record'));
	fireEvent.changeText(ui.getByPlaceholderText('0'), amount);
	fireEvent.press(
		ui.getByTestId(reservation ? 'reservation-submit-button' : 'transaction-save-button')
	);
	await waitFor(() => expect(ui.getByTestId('practice-next')).toBeTruthy());
	fireEvent.press(ui.getByTestId('practice-next'));
}

test('teaches three movements with entered amounts while personal data remains untouched', async () => {
	const personal = {
		id: 'owned-account',
		name: 'Personal bank',
		type: 'account' as const,
		currency: 'EUR',
		row: 0,
		position: 0,
	};
	const tx = {
		id: 'owned-transaction',
		from_entity_id: 'owned-income',
		to_entity_id: personal.id,
		amount_minor: 76543,
		currency: 'EUR',
		timestamp: 1,
		is_confirmed: true,
	};
	useStore.setState({
		entities: [personal],
		transactions: [tx],
		bubbleGestureMode: 'tap-opens-history',
	});
	const before = useStore.getState();
	const ui = render(<PracticeScreen />);
	await record(ui, '1200');
	await record(ui, '50');
	await record(ui, '200', true);
	expect(ui.getByTestId('practice-finish')).toBeTruthy();
	expect(ui.getByText(/950/)).toBeTruthy();
	expect(useStore.getState().entities).toEqual([personal]);
	expect(useStore.getState().transactions).toEqual([tx]);
	expect(useStore.getState().bubbleGestureMode).toBe(before.bubbleGestureMode);
	fireEvent.press(ui.getByTestId('practice-finish'));
	expect(mockReplace).toHaveBeenCalledWith('/onboarding/setup');
});

test('replay exit is reachable inside an open sheet and starts fresh on next visit', async () => {
	mockParams = { origin: 'settings' };
	const ui = render(<PracticeScreen />);
	fireEvent.press(ui.getByTestId('practice-record'));
	expect(ui.getByTestId('practice-sheet-exit')).toBeTruthy();
	fireEvent.press(ui.getByTestId('practice-sheet-exit'));
	expect(mockBack).toHaveBeenCalledTimes(1);
	ui.unmount();
	const fresh = render(<PracticeScreen />);
	expect(fresh.getByText('1 of 3')).toBeTruthy();
});

test('cancel and demo do not advance the lesson', async () => {
	const ui = render(<PracticeScreen />);
	fireEvent.press(ui.getByTestId('practice-demo'));
	expect(ui.getByText('1 of 3')).toBeTruthy();
	fireEvent.press(ui.getByTestId('practice-record'));
	fireEvent.press(ui.getByTestId('transaction-cancel-button'));
	expect(ui.queryByTestId('practice-next')).toBeNull();
	expect(ui.getByText('1 of 3')).toBeTruthy();
});

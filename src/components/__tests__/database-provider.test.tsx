import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import DatabaseProvider from '../database-provider';
import { useStore } from '@/src/store';
import { getDrizzleDb } from '@/src/db';

jest.mock('@/src/db', () => ({
	getDrizzleDb: jest.fn(),
}));

jest.mock('@/src/store', () => ({
	useStore: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
	preventAutoHideAsync: jest.fn(),
	hideAsync: jest.fn(),
}));

describe('DatabaseProvider', () => {
	const mockInitialize = jest.fn();
	const mockBackfillRecurringIfStale = jest.fn();
	let consoleErrorSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		mockInitialize.mockResolvedValue(undefined);
		mockBackfillRecurringIfStale.mockResolvedValue(undefined);
		jest.mocked(getDrizzleDb).mockResolvedValue({} as never);
		jest.mocked(useStore).mockImplementation((selector) =>
			selector({
				initialize: mockInitialize,
				backfillRecurringIfStale: mockBackfillRecurringIfStale,
			} as never)
		);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it('owns app startup and renders children after db and store initialization', async () => {
		const { getByTestId, queryByTestId, getByText } = render(
			<DatabaseProvider fontsLoaded={true}>
				<Text>ready</Text>
			</DatabaseProvider>
		);

		expect(getByTestId('loading-screen')).toBeTruthy();

		await waitFor(() => {
			expect(getDrizzleDb).toHaveBeenCalledTimes(1);
			expect(mockInitialize).toHaveBeenCalledTimes(1);
			expect(queryByTestId('loading-screen')).toBeNull();
			expect(getByText('ready')).toBeTruthy();
		});
	});

	it('stays on the loading screen until fonts load, even after the db is ready', async () => {
		const { getByTestId, queryByText, queryByTestId, rerender } = render(
			<DatabaseProvider fontsLoaded={false}>
				<Text>ready</Text>
			</DatabaseProvider>
		);

		// DB init completes, but fonts are still loading -> still gated.
		await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));
		expect(getByTestId('loading-screen')).toBeTruthy();
		expect(queryByText('ready')).toBeNull();
		expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

		// Fonts finish -> content renders and the splash is dismissed.
		rerender(
			<DatabaseProvider fontsLoaded={true}>
				<Text>ready</Text>
			</DatabaseProvider>
		);
		await waitFor(() => {
			expect(queryByTestId('loading-screen')).toBeNull();
		});
		expect(SplashScreen.hideAsync).toHaveBeenCalled();
	});

	it('hides the native splash once fonts and db are both ready', async () => {
		render(
			<DatabaseProvider fontsLoaded={true}>
				<Text>ready</Text>
			</DatabaseProvider>
		);

		await waitFor(() => {
			expect(getDrizzleDb).toHaveBeenCalledTimes(1);
			expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
		});
	});

	it('shows an error when database startup fails', async () => {
		jest.mocked(getDrizzleDb).mockRejectedValue(new Error('boom'));

		const { getByText } = render(
			<DatabaseProvider fontsLoaded={true}>
				<Text>ready</Text>
			</DatabaseProvider>
		);

		await waitFor(() => {
			expect(getByText('App startup error: boom')).toBeTruthy();
		});

		expect(mockInitialize).not.toHaveBeenCalled();
	});

	it('shows an error when store hydration fails', async () => {
		mockInitialize.mockRejectedValue(new Error('hydrate failed'));

		const { getByText } = render(
			<DatabaseProvider fontsLoaded={true}>
				<Text>ready</Text>
			</DatabaseProvider>
		);

		await waitFor(() => {
			expect(getByText('App startup error: hydrate failed')).toBeTruthy();
		});
	});

	// KII-159: derivation stops deriving today's occurrence virtually the moment
	// the civil day rolls over, so a warm process left open across local
	// midnight needs its own trigger to materialize it — the AppState listener
	// above only fires on a foreground transition.
	describe('midnight backfill timer (KII-159)', () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it('fires a backfill at local midnight and re-arms for the following one', async () => {
			// One second before local midnight.
			jest.setSystemTime(new Date(2026, 0, 15, 23, 59, 59, 0));

			render(
				<DatabaseProvider fontsLoaded={true}>
					<Text>ready</Text>
				</DatabaseProvider>
			);
			// `waitFor` auto-pumps jest's fake timers while polling, which would
			// blow straight past the precise midnight boundary this test is
			// staging. `initialize`/`getDrizzleDb` resolve via microtasks (not a
			// timer), so a plain `act` flush is enough to reach isReady === true.
			await act(async () => {});
			expect(mockInitialize).toHaveBeenCalledTimes(1);
			// Isolate from the mount-time call the initialize/AppState effects don't
			// make in this test (backfillRecurringIfStale is only ever invoked by
			// the midnight timer here), so a stray extra call would still show up.
			mockBackfillRecurringIfStale.mockClear();

			// Not midnight yet.
			await act(async () => {
				jest.advanceTimersByTime(999);
			});
			expect(mockBackfillRecurringIfStale).not.toHaveBeenCalled();

			// Crosses local midnight.
			await act(async () => {
				jest.advanceTimersByTime(1);
			});
			expect(mockBackfillRecurringIfStale).toHaveBeenCalledTimes(1);

			// Re-armed for the following midnight, 24h later.
			await act(async () => {
				jest.advanceTimersByTime(24 * 60 * 60 * 1000);
			});
			expect(mockBackfillRecurringIfStale).toHaveBeenCalledTimes(2);
		});

		it('clears the midnight timer on unmount', async () => {
			jest.setSystemTime(new Date(2026, 0, 15, 23, 59, 59, 0));

			const { unmount } = render(
				<DatabaseProvider fontsLoaded={true}>
					<Text>ready</Text>
				</DatabaseProvider>
			);
			await act(async () => {});
			expect(mockInitialize).toHaveBeenCalledTimes(1);
			mockBackfillRecurringIfStale.mockClear();

			unmount();

			await act(async () => {
				jest.advanceTimersByTime(24 * 60 * 60 * 1000);
			});
			expect(mockBackfillRecurringIfStale).not.toHaveBeenCalled();
		});
	});
});

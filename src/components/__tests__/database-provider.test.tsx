import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
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
});

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import DatabaseProvider from '../database-provider';
import { useStore } from '@/src/store';
import { getDrizzleDb } from '@/src/db';

jest.mock('@/src/db', () => ({
	getDrizzleDb: jest.fn(),
}));

jest.mock('@/src/store', () => ({
	useStore: jest.fn(),
}));

describe('DatabaseProvider', () => {
	const mockInitialize = jest.fn();
	let consoleErrorSpy: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		mockInitialize.mockResolvedValue(undefined);
		jest.mocked(getDrizzleDb).mockResolvedValue({} as never);
		jest.mocked(useStore).mockImplementation((selector) =>
			selector({ initialize: mockInitialize } as never)
		);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it('owns app startup and renders children after db and store initialization', async () => {
		const { getByText, queryByText } = render(
			<DatabaseProvider>
				<Text>ready</Text>
			</DatabaseProvider>
		);

		expect(getByText('Loading app...')).toBeTruthy();

		await waitFor(() => {
			expect(getDrizzleDb).toHaveBeenCalledTimes(1);
			expect(mockInitialize).toHaveBeenCalledTimes(1);
			expect(queryByText('Loading app...')).toBeNull();
			expect(getByText('ready')).toBeTruthy();
		});
	});

	it('shows an error when database startup fails', async () => {
		jest.mocked(getDrizzleDb).mockRejectedValue(new Error('boom'));

		const { getByText } = render(
			<DatabaseProvider>
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
			<DatabaseProvider>
				<Text>ready</Text>
			</DatabaseProvider>
		);

		await waitFor(() => {
			expect(getByText('App startup error: hydrate failed')).toBeTruthy();
		});
	});
});

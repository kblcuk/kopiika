import React from 'react';
import { Alert, Switch } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../settings';
import { useStore } from '@/src/store';
import { updateTransactionNotificationIdsBatch } from '@/src/db';
import {
	getRemindersEnabled,
	setHasRequestedPermission,
	setLastBackgroundNotificationKey,
	setRemindersEnabled,
} from '@/src/utils/app-prefs';
import {
	cancelAllNotifications,
	getNotifiableTransactions,
	requestPermission,
	scheduleTransactionNotification,
	updateBadgeCount,
} from '@/src/services/notifications';
import { registerBackgroundTask, unregisterBackgroundTask } from '@/src/services/background-task';

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('lucide-react-native', () => ({
	ChevronRight: 'ChevronRight',
}));

jest.mock('expo-constants', () => ({
	expoConfig: { version: 'test-version' },
}));

jest.mock('@/src/db', () => ({
	updateTransactionNotificationIdsBatch: jest.fn(),
}));

jest.mock('@/src/utils/app-prefs', () => ({
	getRemindersEnabled: jest.fn(),
	setRemindersEnabled: jest.fn(),
	setHasRequestedPermission: jest.fn(),
	setLastBackgroundNotificationKey: jest.fn(),
}));

jest.mock('@/src/services/notifications', () => ({
	cancelAllNotifications: jest.fn(),
	updateBadgeCount: jest.fn(),
	scheduleTransactionNotification: jest.fn(),
	getNotifiableTransactions: jest.fn(),
	setupNotificationChannel: jest.fn(),
	requestPermission: jest.fn(),
}));

jest.mock('@/src/services/background-task', () => ({
	registerBackgroundTask: jest.fn(),
	unregisterBackgroundTask: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
	getDocumentAsync: jest.fn(),
}));

jest.mock('@/src/utils/export', () => ({
	exportAllData: jest.fn(),
}));

jest.mock('@/src/store', () => {
	const mockUseStore = Object.assign(jest.fn(), {
		setState: jest.fn(),
	});
	return { useStore: mockUseStore };
});

describe('SettingsScreen', () => {
	let storeState: {
		entities: { id: string; name: string }[];
		plans: unknown[];
		transactions: Record<string, unknown>[];
		recurrenceTemplates: unknown[];
		marketValueSnapshots: unknown[];
		initialize: jest.Mock;
		replaceAllData: jest.Mock;
	};

	beforeEach(() => {
		jest.clearAllMocks();

		storeState = {
			entities: [
				{ id: 'entity-1', name: 'Checking' },
				{ id: 'entity-2', name: 'Groceries' },
			],
			plans: [],
			transactions: [],
			recurrenceTemplates: [],
			marketValueSnapshots: [],
			initialize: jest.fn(),
			replaceAllData: jest.fn(),
		};

		const mockedUseStore = useStore as typeof useStore & {
			setState: jest.Mock;
			mockImplementation: jest.Mock;
		};
		mockedUseStore.mockImplementation(() => storeState as never);
		mockedUseStore.setState.mockImplementation((updater) => {
			const partial = typeof updater === 'function' ? updater(storeState) : updater;
			storeState = { ...storeState, ...partial };
		});
	});

	test('turning reminders off clears persisted notification ids', async () => {
		storeState.transactions = [
			{
				id: 'tx-1',
				from_entity_id: 'entity-1',
				to_entity_id: 'entity-2',
				amount: 12,
				currency: 'USD',
				timestamp: Date.now() + 60_000,
				notification_id: 'notif-1',
			},
			{
				id: 'tx-2',
				from_entity_id: 'entity-1',
				to_entity_id: 'entity-2',
				amount: 20,
				currency: 'USD',
				timestamp: Date.now() + 120_000,
				notification_id: 'notif-2',
			},
		];

		jest.mocked(getRemindersEnabled).mockResolvedValue(true);

		const { UNSAFE_getByType } = render(<SettingsScreen />);

		await waitFor(() => expect(getRemindersEnabled).toHaveBeenCalled());
		fireEvent(UNSAFE_getByType(Switch), 'valueChange', false);

		await waitFor(() => {
			expect(cancelAllNotifications).toHaveBeenCalled();
			expect(updateBadgeCount).toHaveBeenCalledWith(0);
			expect(unregisterBackgroundTask).toHaveBeenCalled();
			expect(setLastBackgroundNotificationKey).toHaveBeenCalledWith(null);
			expect(updateTransactionNotificationIdsBatch).toHaveBeenCalledWith([
				{ id: 'tx-1', notificationId: null },
				{ id: 'tx-2', notificationId: null },
			]);
			expect(storeState.transactions.every((tx) => !tx.notification_id)).toBe(true);
		});
	});

	test('turning reminders on reschedules future items and syncs ids into store state', async () => {
		storeState.transactions = [
			{
				id: 'tx-1',
				from_entity_id: 'entity-1',
				to_entity_id: 'entity-2',
				amount: 12,
				currency: 'USD',
				timestamp: Date.now() + 60_000,
				is_confirmed: false,
			},
		];

		jest.mocked(getRemindersEnabled).mockResolvedValue(false);
		jest.mocked(requestPermission).mockResolvedValue(true);
		jest.mocked(getNotifiableTransactions).mockReturnValue(storeState.transactions as never);
		jest.mocked(scheduleTransactionNotification).mockResolvedValue('notif-123');

		const { UNSAFE_getByType } = render(<SettingsScreen />);

		await waitFor(() => expect(getRemindersEnabled).toHaveBeenCalled());
		fireEvent(UNSAFE_getByType(Switch), 'valueChange', true);

		await waitFor(() => {
			expect(setRemindersEnabled).toHaveBeenCalledWith(true);
			expect(requestPermission).toHaveBeenCalled();
			expect(setHasRequestedPermission).toHaveBeenCalledWith(true);
			expect(updateTransactionNotificationIdsBatch).toHaveBeenCalledWith([
				{ id: 'tx-1', notificationId: 'notif-123' },
			]);
			expect(registerBackgroundTask).toHaveBeenCalled();
			expect(storeState.transactions[0]!.notification_id).toBe('notif-123');
		});
	});

	test('confirming Reset All Data wipes every table and re-hydrates the store', async () => {
		jest.mocked(getRemindersEnabled).mockResolvedValue(true);
		const alertSpy = jest
			.spyOn(Alert, 'alert')
			.mockImplementation((_title, _message, buttons) => {
				buttons?.find((button) => button.text === 'Reset')?.onPress?.();
			});

		try {
			const { getByText } = render(<SettingsScreen />);
			await waitFor(() => expect(getRemindersEnabled).toHaveBeenCalled());

			fireEvent.press(getByText('Reset All Data'));

			await waitFor(() => {
				// The wipe has to go through the FK-safe bulk-delete path, not the
				// native `resetDrizzleDb` no-op that silently kept the data (KII-122).
				expect(storeState.replaceAllData).toHaveBeenCalledWith([], [], [], [], []);
				expect(storeState.initialize).toHaveBeenCalled();
			});
		} finally {
			alertSpy.mockRestore();
		}
	});
});

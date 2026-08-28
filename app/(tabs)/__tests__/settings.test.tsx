import React from 'react';
import { Alert, Switch } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../settings';
import { TestIDs } from '@/e2e/support/test-ids';
import { useStore } from '@/src/store';
import { updateTransactionNotificationIdsBatch } from '@/src/db';
import { exportAllData } from '@/src/utils/export';
import {
	getRemindersEnabled,
	setHasRequestedPermission,
	setLastBackgroundNotificationKey,
	setRemindersEnabled,
	setScheduledReminderKey,
} from '@/src/utils/app-prefs';
import {
	cancelAllNotifications,
	requestPermission,
	updateBadgeCount,
} from '@/src/services/notifications';
import { syncScheduledReminders } from '@/src/services/reminders';
import { registerBackgroundTask, unregisterBackgroundTask } from '@/src/services/background-task';

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('lucide-react-native', () => ({
	ChevronRight: 'ChevronRight',
	Check: 'Check',
	X: 'X',
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
	setScheduledReminderKey: jest.fn(),
}));

jest.mock('@/src/services/notifications', () => ({
	cancelAllNotifications: jest.fn(),
	updateBadgeCount: jest.fn(),
	setupNotificationChannel: jest.fn(),
	requestPermission: jest.fn(),
}));

jest.mock('@/src/services/reminders', () => ({
	syncScheduledReminders: jest.fn(),
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
		getState: jest.fn(),
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
		appCurrency: string;
		setAppCurrency: jest.Mock;
		// KII-144: handleExport awaits this before reading fresh state.
		whenFullyHydrated: jest.Mock;
	};

	// Applies overrides onto the shared storeState before rendering, matching
	// the file's existing pattern of mutating `storeState` ahead of `render`.
	const renderSettings = (overrides: Partial<typeof storeState> = {}) => {
		storeState = { ...storeState, ...overrides };
		return render(<SettingsScreen />);
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
			appCurrency: 'EUR',
			setAppCurrency: jest.fn().mockResolvedValue(undefined),
			whenFullyHydrated: jest.fn().mockResolvedValue(undefined),
		};

		const mockedUseStore = useStore as typeof useStore & {
			setState: jest.Mock;
			getState: jest.Mock;
			mockImplementation: jest.Mock;
		};
		mockedUseStore.mockImplementation(() => storeState as never);
		mockedUseStore.setState.mockImplementation((updater) => {
			const partial = typeof updater === 'function' ? updater(storeState) : updater;
			storeState = { ...storeState, ...partial };
		});
		mockedUseStore.getState.mockImplementation(() => storeState as never);
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
			// Without this a re-enable could compute the same fingerprint, skip the
			// sweep, and schedule nothing at all (KII-159).
			expect(setScheduledReminderKey).toHaveBeenCalledWith(null);
			expect(updateTransactionNotificationIdsBatch).toHaveBeenCalledWith([
				{ id: 'tx-1', notificationId: null },
				{ id: 'tx-2', notificationId: null },
			]);
			expect(storeState.transactions.every((tx) => !tx.notification_id)).toBe(true);
		});
	});

	test('turning reminders on clears the fingerprint and rebuilds the schedule from current state', async () => {
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
		storeState.recurrenceTemplates = [{ id: 'template-1' }];

		jest.mocked(getRemindersEnabled).mockResolvedValue(false);
		jest.mocked(requestPermission).mockResolvedValue(true);

		const { UNSAFE_getByType } = render(<SettingsScreen />);

		await waitFor(() => expect(getRemindersEnabled).toHaveBeenCalled());
		fireEvent(UNSAFE_getByType(Switch), 'valueChange', true);

		await waitFor(() => {
			expect(setRemindersEnabled).toHaveBeenCalledWith(true);
			expect(requestPermission).toHaveBeenCalled();
			expect(setHasRequestedPermission).toHaveBeenCalledWith(true);
			// Templates are part of the sweep's input: future recurring occurrences
			// are virtual and would otherwise be invisible to the scheduler (KII-159).
			expect(syncScheduledReminders).toHaveBeenCalledWith(
				storeState.recurrenceTemplates,
				storeState.transactions,
				storeState.entities
			);
			expect(registerBackgroundTask).toHaveBeenCalled();
		});
		// The sweep owns the schedule now; the screen writes no notification ids.
		expect(setScheduledReminderKey).toHaveBeenCalledWith(null);
		expect(updateTransactionNotificationIdsBatch).not.toHaveBeenCalled();
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

	test('shows the current app currency', () => {
		const { getByTestId } = renderSettings();
		// Regex match, not an exact string: the row's text content also includes
		// the "Currency" label and symbol (matches the precedent in
		// app/onboarding/__tests__/setup.test.tsx for the same reason).
		expect(getByTestId(TestIDs.settings.currencyRow)).toHaveTextContent(/EUR/);
	});

	test('confirms before relabelling existing data, then dispatches', () => {
		const alertSpy = jest.spyOn(Alert, 'alert');
		try {
			const setAppCurrency = jest.fn().mockResolvedValue(undefined);
			const { getByTestId } = renderSettings({ setAppCurrency });

			fireEvent.press(getByTestId(TestIDs.settings.currencyRow));
			fireEvent.press(getByTestId(TestIDs.currencyPicker.option('GBP')));

			// Confirm is required — nothing is written until the user agrees.
			expect(setAppCurrency).not.toHaveBeenCalled();
			expect(alertSpy).toHaveBeenCalled();

			const buttons = alertSpy.mock.calls.at(-1)![2]!;
			const change = buttons.find((button) => button.text === 'Change')!;
			change.onPress!();

			expect(setAppCurrency).toHaveBeenCalledWith('GBP');
		} finally {
			alertSpy.mockRestore();
		}
	});

	test('says amounts are not converted, with a precision-correct example (KII-166)', () => {
		const alertSpy = jest.spyOn(Alert, 'alert');
		try {
			const { getByTestId } = renderSettings();

			fireEvent.press(getByTestId(TestIDs.settings.currencyRow));
			fireEvent.press(getByTestId(TestIDs.currencyPicker.option('JPY')));

			const message = alertSpy.mock.calls.at(-1)![1];
			expect(message).toContain("aren't converted");
			// The example is the whole point of the dialog — a hardcoded or
			// wrong figure (e.g. ¥10 instead of ¥1,050) would still pass a bare
			// "aren't converted" check. The same stored minor-unit integer
			// (1050) renders as 10.50 under EUR (2dp) but 1,050 under JPY (0dp).
			expect(message).toContain('will be shown as');
			expect(message).toContain('€10.50');
			expect(message).toContain('¥1,050');
		} finally {
			alertSpy.mockRestore();
		}
	});

	test('does not prompt when the currency is unchanged', () => {
		const alertSpy = jest.spyOn(Alert, 'alert');
		try {
			const setAppCurrency = jest.fn();
			const { getByTestId } = renderSettings({ setAppCurrency });

			fireEvent.press(getByTestId(TestIDs.settings.currencyRow));
			fireEvent.press(getByTestId(TestIDs.currencyPicker.option('EUR')));

			expect(alertSpy).not.toHaveBeenCalled();
			expect(setAppCurrency).not.toHaveBeenCalled();
		} finally {
			alertSpy.mockRestore();
		}
	});

	test('an empty board skips the prompt and applies directly', async () => {
		const alertSpy = jest.spyOn(Alert, 'alert');
		try {
			const setAppCurrency = jest.fn().mockResolvedValue(undefined);
			const { getByTestId } = renderSettings({
				entities: [],
				transactions: [],
				setAppCurrency,
			});

			fireEvent.press(getByTestId(TestIDs.settings.currencyRow));
			fireEvent.press(getByTestId(TestIDs.currencyPicker.option('GBP')));

			expect(alertSpy).not.toHaveBeenCalled();
			await waitFor(() => expect(setAppCurrency).toHaveBeenCalledWith('GBP'));
		} finally {
			alertSpy.mockRestore();
		}
	});

	test('shows an error alert when changing currency fails (KII-166)', async () => {
		const alertSpy = jest
			.spyOn(Alert, 'alert')
			.mockImplementation((_title, _message, buttons) => {
				buttons?.find((button) => button.text === 'Change')?.onPress?.();
			});
		try {
			const setAppCurrency = jest.fn().mockRejectedValue(new Error('write failed'));
			const { getByTestId } = renderSettings({ setAppCurrency });

			fireEvent.press(getByTestId(TestIDs.settings.currencyRow));
			fireEvent.press(getByTestId(TestIDs.currencyPicker.option('JPY')));

			await waitFor(() => {
				expect(alertSpy).toHaveBeenCalledWith(
					'Could not change currency',
					'Something went wrong while updating your currency. Please try again.'
				);
			});
		} finally {
			alertSpy.mockRestore();
		}
	});

	test('exporting waits for full hydration and exports fresh state, not the closure captured at render time (KII-144)', async () => {
		jest.mocked(getRemindersEnabled).mockResolvedValue(true);

		// Hydration is still in flight when the export button is pressed: the
		// render-time closure only has the phase-1 partial `transactions`.
		let resolveHydration!: () => void;
		storeState.whenFullyHydrated.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveHydration = resolve;
			})
		);

		const { getByText } = render(<SettingsScreen />);
		await waitFor(() => expect(getRemindersEnabled).toHaveBeenCalled());

		fireEvent.press(getByText('Export to CSV'));
		await waitFor(() => expect(storeState.whenFullyHydrated).toHaveBeenCalled());

		// While hydration is still pending, the export must not have fired yet
		// — otherwise it would ship the phase-1 partial array.
		expect(exportAllData).not.toHaveBeenCalled();

		// Simulate the phase-2 swap landing with the full table, then let
		// hydration resolve.
		storeState.transactions = [{ id: 'full-history-tx' }];
		resolveHydration();

		await waitFor(() => expect(exportAllData).toHaveBeenCalled());
		expect(exportAllData).toHaveBeenCalledWith(
			storeState.entities,
			storeState.plans,
			[{ id: 'full-history-tx' }],
			storeState.recurrenceTemplates,
			storeState.marketValueSnapshots
		);
	});
});

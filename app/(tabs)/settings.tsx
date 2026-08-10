import { View, Pressable, Alert, Linking, Switch } from 'react-native';
import { useEffect, useState } from 'react';
import { Text } from '@/src/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '@/src/theme/colors';
import { TestIDs } from '@/e2e/support/test-ids';
import { CurrencyPickerSheet } from '@/src/components/currency-picker-sheet';
import { getCurrencySymbol, formatAmount } from '@/src/utils/format';
import { toMinor } from '@/src/utils/money';

import { useStore } from '@/src/store';
import { exportAllData } from '@/src/utils/export';
import { parseImportCsv, formatImportErrors, type ParsedImportData } from '@/src/utils/import';
import { updateTransactionNotificationIdsBatch } from '@/src/db';
import Constants from 'expo-constants';
import {
	getRemindersEnabled,
	setHasRequestedPermission,
	setLastBackgroundNotificationKey,
	setRemindersEnabled,
	setScheduledReminderKey,
} from '@/src/utils/app-prefs';
import {
	cancelAllNotifications,
	updateBadgeCount,
	setupNotificationChannel,
	requestPermission,
} from '@/src/services/notifications';
import { syncScheduledReminders } from '@/src/services/reminders';
import { registerBackgroundTask, unregisterBackgroundTask } from '@/src/services/background-task';

export default function SettingsScreen() {
	// KII-132: bare `useStore()` re-renders on every store change. Switch to
	// `useShallow` selector — settings doesn't need fine-grained reactivity.
	const {
		entities,
		plans,
		transactions,
		recurrenceTemplates,
		marketValueSnapshots,
		initialize,
		replaceAllData,
		appCurrency,
		setAppCurrency,
	} = useStore();

	const [remindersEnabled, setRemindersToggle] = useState(true);
	const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

	useEffect(() => {
		void (async () => {
			setRemindersToggle(await getRemindersEnabled());
		})();
	}, []);

	const handleToggleReminders = async (enabled: boolean) => {
		// Optimistic UI: flip the toggle first so the user sees the intent.
		// If anything below fails, the catch reverts to the pre-toggle state
		// so the switch can't lie about whether reminders are actually on.
		const previous = remindersEnabled;
		setRemindersToggle(enabled);
		try {
			await setRemindersEnabled(enabled);

			if (!enabled) {
				await cancelAllNotifications();
				await updateBadgeCount(0);
				await unregisterBackgroundTask();
				await setLastBackgroundNotificationKey(null);
				// Nothing is scheduled any more, so the fingerprint must not claim
				// otherwise — a re-enable that computes the same schedule would
				// short-circuit the sweep and schedule nothing at all (KII-159).
				await setScheduledReminderKey(null);

				const existingNotificationIds = transactions
					.filter((tx) => tx.notification_id)
					.map((tx) => ({ id: tx.id, notificationId: null }));
				if (existingNotificationIds.length > 0) {
					await updateTransactionNotificationIdsBatch(existingNotificationIds);
					useStore.setState((state) => ({
						transactions: state.transactions.map((tx) =>
							tx.notification_id ? { ...tx, notification_id: undefined } : tx
						),
					}));
				}
			} else {
				const granted = await requestPermission();
				await setHasRequestedPermission(true);
				if (!granted) {
					setRemindersToggle(false);
					await setRemindersEnabled(false);
					return;
				}
				await setLastBackgroundNotificationKey(null);
				await setScheduledReminderKey(null); // force the next sweep to run
				await setupNotificationChannel();
				await syncScheduledReminders(recurrenceTemplates, transactions, entities);
				await registerBackgroundTask();
			}
		} catch (error) {
			console.error('Failed to toggle reminders:', error);
			setRemindersToggle(previous);
			try {
				await setRemindersEnabled(previous);
			} catch (revertError) {
				console.error('Failed to revert reminder pref:', revertError);
			}
			Alert.alert(
				'Could not update reminders',
				'Something went wrong while updating your reminder settings. Please try again.'
			);
		}
	};

	// KII-155: a currency change relabels every existing row. Amounts are not
	// converted, so the confirm has to say what actually happens to the numbers.
	const handleCurrencySelect = (code: string) => {
		if (code === appCurrency) return;

		const hasData = entities.length > 0 || transactions.length > 0;
		const runChange = async () => {
			try {
				await setAppCurrency(code);
			} catch (error) {
				console.error('Failed to change currency:', error);
				Alert.alert(
					'Could not change currency',
					'Something went wrong while updating your currency. Please try again.'
				);
			}
		};

		if (!hasData) {
			void runChange();
			return;
		}

		// Build the example by formatting ONE stored integer in both currencies —
		// exactly what the op does — so the copy can't drift from the behaviour.
		const exampleMinor = toMinor(10.5, appCurrency);
		const example = `${getCurrencySymbol(appCurrency)}${formatAmount(exampleMinor, appCurrency)} will be shown as ${getCurrencySymbol(code)}${formatAmount(exampleMinor, code)}`;
		Alert.alert(
			`Change currency to ${code}?`,
			`Every entity and transaction will be relabelled ${code}.\n\nAmounts aren't converted — ${example}.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Change',
					onPress: () => {
						void runChange();
					},
				},
			]
		);
	};

	const router = useRouter();
	const version = Constants.expoConfig?.version || 'unknown';
	const privacyPolicyUrl = 'https://kblcuk.codeberg.page/kopiika/privacy-policy.html';

	const handleOpenPrivacyPolicy = async () => {
		try {
			const supported = await Linking.canOpenURL(privacyPolicyUrl);
			if (!supported) {
				Alert.alert(
					'Could Not Open Link',
					'No app is available to open the privacy policy link.'
				);
				return;
			}
			await Linking.openURL(privacyPolicyUrl);
		} catch (error) {
			console.error('Failed to open privacy policy link', error);
			Alert.alert('Could Not Open Link', 'Please try again later.');
		}
	};

	const handleExport = async () => {
		try {
			await exportAllData(
				entities,
				plans,
				transactions,
				recurrenceTemplates,
				marketValueSnapshots
			);
		} catch (error) {
			console.error('Failed to export data', error);
			Alert.alert('Export Failed', 'Could not export data. Please try again.');
		}
	};

	const confirmReplace = (data: ParsedImportData) => {
		const runReplace = async () => {
			try {
				await replaceAllData(
					data.entities,
					data.plans,
					data.transactions,
					data.recurrenceTemplates,
					data.marketValueSnapshots
				);
				Alert.alert('Import Complete', 'All data has been replaced.');
			} catch (error) {
				console.error('Failed to import data', error);
				Alert.alert(
					'Import Failed',
					'An error occurred during import. Your previous data should be intact.'
				);
			}
		};
		Alert.alert(
			'Replace All Data?',
			`This will replace all existing data with ${data.entities.length} entities, ${data.plans.length} plans, ${data.transactions.length} transactions, ${data.recurrenceTemplates.length} recurring rules, and ${data.marketValueSnapshots.length} market value snapshots.\n\nThis cannot be undone.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Replace',
					style: 'destructive',
					onPress: () => {
						void runReplace();
					},
				},
			]
		);
	};

	const handleImport = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
				copyToCacheDirectory: true,
			});

			if (result.canceled) return;

			const file = new File(result.assets[0]!.uri);
			const content = await file.text();

			const parsed = parseImportCsv(content);
			if (!parsed.ok) {
				Alert.alert('Import Failed', formatImportErrors(parsed.errors));
				return;
			}

			if (parsed.droppable.length > 0) {
				const preview = parsed.droppable
					.slice(0, 5)
					.map((d) => `• ${d.kind} ${d.id}: ${d.reason}`)
					.join('\n');
				const more =
					parsed.droppable.length > 5 ? `\nand ${parsed.droppable.length - 5} more` : '';
				Alert.alert(
					"Some items can't be imported",
					`${parsed.droppable.length} item(s) can't be imported with your current data:\n\n${preview}${more}\n\nContinue without them, or cancel to fix the file?`,
					[
						{ text: 'Cancel', style: 'cancel' },
						{ text: 'Continue', onPress: () => confirmReplace(parsed.data) },
					]
				);
				return;
			}

			confirmReplace(parsed.data);
		} catch (error) {
			console.error('Failed to pick document', error);
			Alert.alert('Import Failed', 'Could not read the selected file.');
		}
	};

	const handleResetData = () => {
		const runReset = async () => {
			try {
				// Wipe through the same FK-safe bulk-delete path CSV import uses.
				// `resetDrizzleDb()` used to live here, but it's a no-op on native
				// (KII-122) — the button cancelled notifications and then re-hydrated
				// the untouched database. `replaceAllData` cancels notifications and
				// clears the badge itself; `initialize()` re-creates the system
				// balance-adjustment entity the wipe removed.
				await replaceAllData([], [], [], [], []);
				await initialize();
			} catch (error) {
				console.error('Failed to reset data', error);
				Alert.alert(
					'Reset Failed',
					'Could not reload the app data after reset. Please restart the app and try again.'
				);
			}
		};
		Alert.alert(
			'Reset All Data',
			'This will delete all your entities, plans, and transactions. This cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Reset',
					style: 'destructive',
					onPress: () => {
						void runReset();
					},
				},
			]
		);
	};

	return (
		<SafeAreaView className="flex-1 bg-paper-50" edges={['top']}>
			{/* Header */}
			<View className="border-b border-paper-300 px-5 pb-4 pt-2">
				<Text className="font-sans-bold text-2xl text-ink">Settings</Text>
			</View>

			{/* Content */}
			<View className="flex-1 px-5 pt-6">
				{/* Data Section */}
				<Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Data
				</Text>

				<View className="mb-6 overflow-hidden rounded-lg bg-paper-100">
					<Pressable
						onPress={() => {
							void handleExport();
						}}
						className="flex-row items-center justify-between border-b border-paper-300 px-4 py-3.5 active:bg-paper-200"
					>
						<Text className="font-sans text-base text-ink">Export to CSV</Text>
						<Text className="font-sans text-sm text-ink-muted">
							{entities.length} entities, {transactions.length} transactions
						</Text>
					</Pressable>

					<Pressable
						onPress={() => {
							void handleImport();
						}}
						className="flex-row items-center border-b border-paper-300 px-4 py-3.5 active:bg-paper-200"
					>
						<Text className="font-sans text-base text-ink">Import from CSV</Text>
					</Pressable>

					<Pressable
						onPress={handleResetData}
						className="flex-row items-center px-4 py-3.5 active:bg-paper-200"
					>
						<Text className="font-sans text-base text-negative">Reset All Data</Text>
					</Pressable>
				</View>

				{/* Preferences Section */}
				<Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Preferences
				</Text>

				<View className="mb-6 overflow-hidden rounded-lg bg-paper-100">
					<Pressable
						testID={TestIDs.settings.currencyRow}
						onPress={() => setCurrencyPickerOpen(true)}
						className="flex-row items-center justify-between px-4 py-3.5 active:bg-paper-200"
					>
						<Text className="font-sans text-base text-ink">Currency</Text>
						<View className="flex-row items-center">
							<Text className="font-sans text-sm text-ink-muted">
								{getCurrencySymbol(appCurrency)} {appCurrency}
							</Text>
							<ChevronRight size={16} color={colors.ink.muted} />
						</View>
					</Pressable>
				</View>

				{/* Notifications Section */}
				<Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Notifications
				</Text>

				<View className="mb-6 overflow-hidden rounded-lg bg-paper-100">
					<View className="flex-row items-center justify-between px-4 py-3.5">
						<Text className="font-sans text-base text-ink">Transaction Reminders</Text>
						<Switch
							value={remindersEnabled}
							onValueChange={(enabled) => {
								void handleToggleReminders(enabled);
							}}
							// KII-132: brand orange hardcoded here and in `app/(tabs)/_layout.tsx`.
							// Pull from `src/theme/colors` so the brand color lives in one place.
							trackColor={{ false: '#D1CBC0', true: '#D4652F' }}
							thumbColor="#FFFBF5"
						/>
					</View>
				</View>

				{/* Help Section */}
				<Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Help
				</Text>

				<View className="mb-6 overflow-hidden rounded-lg bg-paper-100">
					<Pressable
						testID={TestIDs.settings.helpRow}
						// KII-132: `as never` defeats expo-router's typed-route check. Use the
						// typed route form (typed `Href` for `/help`) and drop the cast.
						onPress={() => router.push('/help' as never)}
						className="flex-row items-center justify-between border-b border-paper-300 px-4 py-3.5 active:bg-paper-200"
					>
						<View>
							<Text className="font-sans text-base text-ink">
								Help &amp; how it works
							</Text>
							<Text className="font-sans text-sm text-ink-muted">
								Concepts, transactions, tips
							</Text>
						</View>
						<ChevronRight size={16} color={colors.ink.muted} />
					</Pressable>

					<Pressable
						testID={TestIDs.settings.tourRow}
						onPress={() =>
							router.push('/onboarding/welcome?fromSettings=true' as never)
						}
						className="flex-row items-center justify-between px-4 py-3.5 active:bg-paper-200"
					>
						<View>
							<Text className="font-sans text-base text-ink">Take the tour</Text>
							<Text className="font-sans text-sm text-ink-muted">
								See what new users see
							</Text>
						</View>
						<ChevronRight size={16} color={colors.ink.muted} />
					</Pressable>
				</View>

				{/* About Section */}
				<Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					About
				</Text>

				<View className="overflow-hidden rounded-lg bg-paper-100">
					<View className="flex-row items-center justify-between px-4 py-3.5">
						<Text className="font-sans text-base text-ink">Version</Text>
						<Text className="font-sans text-sm text-ink-muted">{version}</Text>
					</View>
					<Pressable
						onPress={() => {
							void handleOpenPrivacyPolicy();
						}}
						className="flex-row items-center justify-between border-t border-paper-300 px-4 py-3.5 active:bg-paper-200"
					>
						<Text className="font-sans text-base text-ink">Privacy Policy</Text>
						<Text className="font-sans text-sm text-ink-muted">Open</Text>
					</Pressable>
				</View>

				{/* Footer */}
				<View className="mt-auto items-center pb-8 pt-6">
					<Text className="font-sans text-sm text-ink-muted">
						Kopiika - Personal Finance Tracker
					</Text>
					<Text className="font-sans text-xs text-ink-muted">
						Built with simplicity in mind
					</Text>
				</View>
			</View>

			<CurrencyPickerSheet
				visible={currencyPickerOpen}
				selectedCode={appCurrency}
				onSelect={handleCurrencySelect}
				onClose={() => setCurrencyPickerOpen(false)}
			/>
		</SafeAreaView>
	);
}

import { View, Pressable, Alert, Linking, Switch } from 'react-native';
import { useEffect, useState } from 'react';
import { Text } from '@/src/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import { useStore } from '@/src/store';
import { exportAllData } from '@/src/utils/export';
import { parseImportCsv, formatImportErrors } from '@/src/utils/import';
import { resetDrizzleDb, updateTransactionNotificationIdsBatch } from '@/src/db';
import Constants from 'expo-constants';
import {
	getRemindersEnabled,
	setHasRequestedPermission,
	setLastBackgroundNotificationKey,
	setRemindersEnabled,
} from '@/src/utils/app-prefs';
import {
	cancelAllNotifications,
	updateBadgeCount,
	scheduleTransactionNotification,
	getNotifiableTransactions,
	setupNotificationChannel,
	requestPermission,
} from '@/src/services/notifications';
import { registerBackgroundTask, unregisterBackgroundTask } from '@/src/services/background-task';

export default function SettingsScreen() {
	const { entities, plans, transactions, marketValueSnapshots, initialize, replaceAllData } =
		useStore();

	const [remindersEnabled, setRemindersToggle] = useState(true);

	useEffect(() => {
		getRemindersEnabled().then(setRemindersToggle);
	}, []);

	const handleToggleReminders = async (enabled: boolean) => {
		setRemindersToggle(enabled);
		await setRemindersEnabled(enabled);

		if (!enabled) {
			await cancelAllNotifications();
			await updateBadgeCount(0);
			await unregisterBackgroundTask();
			await setLastBackgroundNotificationKey(null);

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
			await setupNotificationChannel();
			const now = Date.now();
			const toSchedule = getNotifiableTransactions(transactions, now);
			const entityMap = new Map(entities.map((e) => [e.id, e.name]));
			const updates: { id: string; notificationId: string | null }[] = [];
			for (const tx of toSchedule) {
				try {
					const notificationId = await scheduleTransactionNotification({
						transactionId: tx.id,
						fromName: entityMap.get(tx.from_entity_id) ?? 'Unknown',
						toName: entityMap.get(tx.to_entity_id) ?? 'Unknown',
						amount: `${tx.amount} ${tx.currency}`,
						timestamp: tx.timestamp,
					});
					updates.push({ id: tx.id, notificationId });
				} catch (e) {
					console.warn('Failed to reschedule notification', e);
				}
			}
			if (updates.length > 0) {
				await updateTransactionNotificationIdsBatch(updates);
				const updateMap = new Map(
					updates.map((update) => [update.id, update.notificationId])
				);
				useStore.setState((state) => ({
					transactions: state.transactions.map((tx) =>
						updateMap.has(tx.id)
							? { ...tx, notification_id: updateMap.get(tx.id) ?? undefined }
							: tx
					),
				}));
			}
			await registerBackgroundTask();
		}
	};

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
			await exportAllData(entities, plans, transactions, marketValueSnapshots);
		} catch (error) {
			console.error('Failed to export data', error);
			Alert.alert('Export Failed', 'Could not export data. Please try again.');
		}
	};

	const handleImport = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
				copyToCacheDirectory: true,
			});

			if (result.canceled) return;

			const file = new File(result.assets[0].uri);
			const content = await file.text();

			const parsed = parseImportCsv(content);
			if (!parsed.ok) {
				Alert.alert('Import Failed', formatImportErrors(parsed.errors));
				return;
			}

			const { data } = parsed;
			Alert.alert(
				'Replace All Data?',
				`This will replace all existing data with ${data.entities.length} entities, ${data.plans.length} plans, ${data.transactions.length} transactions, and ${data.marketValueSnapshots.length} market value snapshots.\n\nThis cannot be undone.`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{
						text: 'Replace',
						style: 'destructive',
						onPress: async () => {
							try {
								await replaceAllData(
									data.entities,
									data.plans,
									data.transactions,
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
						},
					},
				]
			);
		} catch (error) {
			console.error('Failed to pick document', error);
			Alert.alert('Import Failed', 'Could not read the selected file.');
		}
	};

	const handleResetData = () => {
		Alert.alert(
			'Reset All Data',
			'This will delete all your entities, plans, and transactions. This cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Reset',
					style: 'destructive',
					onPress: async () => {
						try {
							await cancelAllNotifications();
							await updateBadgeCount(0);
							resetDrizzleDb();
							await initialize();
						} catch (error) {
							console.error('Failed to reset data', error);
							Alert.alert(
								'Reset Failed',
								'Could not reload the app data after reset. Please restart the app and try again.'
							);
						}
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
						onPress={handleExport}
						className="flex-row items-center justify-between border-b border-paper-300 px-4 py-3.5 active:bg-paper-200"
					>
						<Text className="font-sans text-base text-ink">Export to CSV</Text>
						<Text className="font-sans text-sm text-ink-muted">
							{entities.length} entities, {transactions.length} transactions
						</Text>
					</Pressable>

					<Pressable
						onPress={handleImport}
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

				{/* Notifications Section */}
				<Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					Notifications
				</Text>

				<View className="mb-6 overflow-hidden rounded-lg bg-paper-100">
					<View className="flex-row items-center justify-between px-4 py-3.5">
						<Text className="font-sans text-base text-ink">Transaction Reminders</Text>
						<Switch
							value={remindersEnabled}
							onValueChange={handleToggleReminders}
							trackColor={{ false: '#D1CBC0', true: '#D4652F' }}
							thumbColor="#FFFBF5"
						/>
					</View>
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
						onPress={handleOpenPrivacyPolicy}
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
		</SafeAreaView>
	);
}

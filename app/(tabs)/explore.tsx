import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStore } from '@/src/store';
import { exportAllData } from '@/src/utils/export';
import { resetDatabase } from '@/src/db';

export default function SettingsScreen() {
	const { entities, plans, transactions, initialize } = useStore();

	const handleExport = async () => {
		try {
			await exportAllData(entities, plans, transactions);
		} catch (error) {
			console.error('Failed to export data', error);
			Alert.alert('Export Failed', 'Could not export data. Please try again.');
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
						await resetDatabase();
						await initialize();
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
						<Text className="font-sans text-sm text-ink-faint">
							{entities.length} entities, {transactions.length} transactions
						</Text>
					</Pressable>

					<Pressable
						onPress={handleResetData}
						className="flex-row items-center px-4 py-3.5 active:bg-paper-200"
					>
						<Text className="font-sans text-base text-negative">Reset All Data</Text>
					</Pressable>
				</View>

				{/* About Section */}
				<Text className="mb-3 font-sans-semibold text-xs uppercase tracking-wider text-ink-muted">
					About
				</Text>

				<View className="overflow-hidden rounded-lg bg-paper-100">
					<View className="flex-row items-center justify-between px-4 py-3.5">
						<Text className="font-sans text-base text-ink">Version</Text>
						<Text className="font-sans text-sm text-ink-faint">1.0.0</Text>
					</View>
				</View>

				{/* Footer */}
				<View className="mt-auto items-center pb-8 pt-6">
					<Text className="font-sans text-sm text-ink-faint">
						Kopiika - Personal Finance Tracker
					</Text>
					<Text className="font-sans text-xs text-ink-faint">
						Built with simplicity in mind
					</Text>
				</View>
			</View>
		</SafeAreaView>
	);
}

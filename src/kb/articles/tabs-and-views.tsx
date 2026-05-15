import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function TabsAndViews() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Tabs &amp; views</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Home</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				The drag-and-drop board. Drag an income onto an account to record getting paid; drag
				an account onto a category to record a spend.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Summary</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Aggregates by entity for the period you pick. Tap a category pie slice or row to
				jump into History filtered to that entity.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">History</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Every transaction, filterable by entity, period, and search. The{' '}
				<Text className="font-sans-semibold">Needs Confirmation</Text> section catches
				past-due unconfirmed entries from recurring series.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Settings</Text>
			<Text className="font-sans text-base text-ink">
				Currency, reminders, data export/import, and this help section.
			</Text>
		</View>
	);
}

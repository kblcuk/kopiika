import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function History() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">
				{'History: find and confirm movements'}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Find a transaction'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Choose a month and optionally a bubble. Search matches a note or amount. A bubble filter includes movements where that bubble is either the source or destination. Tap a row to edit its amount, date, or note.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Upcoming and Needs Confirmation'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Upcoming shows scheduled movements. Due movements you have not confirmed appear in Needs Confirmation; they do not count in actual balances yet. Confirm when the money moves. Confirming a future movement early asks whether to record it as today.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Savings and investments'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Reservation summaries group money set aside for a goal by contributing account. Savings reservations and releases remain transactions you can inspect. Investment market values are dated snapshots, separate from money movements.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Recurring and split entries'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Recurring occurrences may be shown before they are stored as individual transactions. Editing or deleting a recurring entry offers a scope for that occurrence or the future series. Split rows belong to one purchase, with one destination per row. The optional recurring and split articles explain these flows.'
				}
			</Text>
		</View>
	);
}

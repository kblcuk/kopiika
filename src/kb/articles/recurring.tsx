import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function Recurring() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Recurring transactions</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Toggle <Text className="font-sans-semibold">Recurring</Text> in the transaction
				modal to make a series. Pick a frequency (daily/weekly/monthly/yearly) and an
				optional end date or occurrence count.
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				The first occurrence dated today or earlier is confirmed immediately. Future
				occurrences start unconfirmed and show in History under{' '}
				<Text className="font-sans-semibold">Needs Confirmation</Text> when their date
				arrives.
			</Text>
			<Text className="font-sans text-base text-ink">
				Editing <Text className="font-sans-semibold">this one</Text> modifies a single
				occurrence; editing <Text className="font-sans-semibold">all future</Text> updates
				the template and regenerates from today forward.
			</Text>
		</View>
	);
}

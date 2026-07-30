import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function TransactionTypes() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Transactions</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Regular</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				One source, one destination, one amount. The bread and butter — every drag, every
				bubble tap, every tap on ✚.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Split</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				One source, multiple destinations. Toggle{' '}
				<Text className="font-sans-semibold">Split</Text> in the transaction modal to divide
				an amount across categories — handy for receipts that mix groceries and household
				goods.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Recurring</Text>
			<Text className="font-sans text-base text-ink">
				A template that generates real transactions ahead of time. Daily, weekly, monthly,
				or yearly. The first occurrence on or before today is confirmed immediately; future
				occurrences sit unconfirmed until you confirm them in History.
			</Text>
		</View>
	);
}

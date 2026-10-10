import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function TransactionTypes() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Transactions</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Choose a movement</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Income → Account records receiving money. Account → Category records spending.
				Account → Account records a transfer. Use the + menu to choose Income, Expense,
				Transfer, or Reserve, then select the bubbles and amount. You can also drag between
				the relevant bubbles.
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Account → Saving reserves money: drag onto a savings goal or use its record gesture.
				Saving → Account releases a reservation: drag back to an account, or clear that
				account&apos;s reservation in the Reserve sheet. Category → Account refunds spending
				and Account → Income reverses income through the refund picker. Reverse drags open
				that picker; they are not ordinary new expenses or income.
			</Text>
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
				A template that shows scheduled occurrences ahead of time. Daily, weekly, monthly,
				or yearly. The first occurrence on or before today is confirmed immediately; future
				occurrences stay unconfirmed until you confirm them in History.
			</Text>
		</View>
	);
}

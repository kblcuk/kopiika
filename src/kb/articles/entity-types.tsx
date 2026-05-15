import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function EntityTypes() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Entity types</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Everything in the app is an entity. There are four types:
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Income</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Money coming in this month. Salary, freelance gigs, rent received.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Accounts</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Where your money lives. Balances are all-time. Toggle{' '}
				<Text className="font-sans-semibold">Include in total</Text> off to keep an account
				visible but excluded from the dashboard balance — useful for foreign-currency cards
				or business accounts you track but don&apos;t count.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Categories</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Where you spend each month. Reset semantics: actuals are evaluated against the
				current month.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Savings</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				Long-term goals. Balance is all-time net inflow from accounts — no separate ledger.
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">Allowed pairs</Text>
			<Text className="font-sans text-base text-ink">
				Income → Account. Account → Account / Category / Saving. Category → Account
				(refund). Saving → Account (release).
			</Text>
		</View>
	);
}

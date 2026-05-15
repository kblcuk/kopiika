import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function InvestmentAccounts() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Investment accounts</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Turn on <Text className="font-sans-semibold">Investment</Text> mode on an account to
				track market value separately from contributions.
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Contributions still come from regular transactions, so dragging from another account
				adds to the purchased price as normal.
			</Text>
			<Text className="font-sans text-base text-ink">
				Market value comes from snapshots you save manually — each snapshot is dated and
				editable in History. Investment accounts are excluded from the dashboard balance
				aggregate, so fluctuating market value doesn&apos;t mix with spendable cash.
			</Text>
		</View>
	);
}

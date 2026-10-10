import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function BubbleSettings() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">
				{'Bubble settings: plans, goals, and accounts'}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Open settings'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Tap the pencil on the Dashboard, then tap a bubble. Change its name, icon, or color and save. Dragging in edit mode only reorders bubbles inside their section.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Plans and goals'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Income plans express expected income. Category plans express monthly spending intent; overspending is allowed. Savings goals express a target to build toward over time. Plans and goals are not money and do not change actual balances.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Accounts'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Default account preselects a source for quick recording. Include in total balance controls whether an ordinary account contributes to the Dashboard Balance. The bubble remains visible when excluded. Editing an account balance creates a balance-adjustment transaction so the history explains the change.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Investment account'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Turn on Investment account to track purchase value and manually entered market-value snapshots separately. Investment accounts are excluded from spendable Balance. Turning this off removes their market-value snapshots after confirmation and saving.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">
				{'Currency and savings'}
			</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Currency is an app-wide setting, not a separate exchange-rate setting for each bubble. Savings details show which accounts contributed; account details show where money is reserved. A reservation records money earmarked for a goal and does not contact your bank.'
				}
			</Text>
		</View>
	);
}

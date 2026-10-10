import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function Summary() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">
				{'Summary: compare spending and plans'}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Choose a month'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'The month picker changes category spending and its comparison with plans. Plans are static amounts that apply each month. Savings amounts carry forward across months; they are not just what you saved in the selected month.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Read the charts'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'The category pie uses positive spending amounts. Larger slices represent more spending. Category rows compare actual spending against the plan and show a four-month spending trend ending in the selected month. Savings rows compare the all-time amount set aside against the goal.'
				}
			</Text>
			<Text className="mb-2 font-sans-semibold text-base text-ink">{'Look closer'}</Text>
			<Text className="mb-4 font-sans text-base text-ink">
				{
					'Tap a category slice or row, or a savings row, to open History filtered to that bubble and the selected month. The History month filter still applies to savings transactions, even though the savings balance itself is all-time.'
				}
			</Text>
		</View>
	);
}

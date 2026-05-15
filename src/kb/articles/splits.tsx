import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function Splits() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Splitting a transaction</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Toggle <Text className="font-sans-semibold">Split</Text> in the transaction modal to
				distribute one amount across multiple destinations. Each row holds its own amount;
				the total updates as you go.
			</Text>
			<Text className="font-sans text-base text-ink">
				Useful when one swipe of the card covers more than one category — groceries plus
				household goods, rent plus utilities, that sort of thing.
			</Text>
		</View>
	);
}

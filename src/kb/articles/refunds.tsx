import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function Refunds() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">
				Refunds &amp; reverse drags
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Reverse drags trigger refund flows. Drag a category onto an account when someone
				returns what you bought; drag an account onto an income source when returning income
				you previously received.
			</Text>
			<Text className="font-sans text-base text-ink">
				A picker shows existing transactions that match — pick the one to refund. Choose the
				amount to reverse and save. The original stays in History; an offsetting transaction
				is added.
			</Text>
		</View>
	);
}

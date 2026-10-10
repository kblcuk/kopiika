import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function CoreLoop() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">
				Record money and see where it goes
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Kopiika is built around a simple loop. You move money in real life, you record it
				here, and you see how reality compares to the plans you set.
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Plans express intent. Transactions express reality. Overspending stays visible — the
				app never quietly hides it.
			</Text>
			<Text className="font-sans text-base text-ink">
				Your data is stored on your device. Kopiika does not link to your bank or move money
				for you.
			</Text>
		</View>
	);
}

import { View } from 'react-native';
import { Text } from '@/src/components/text';

export function Reservations() {
	return (
		<View className="px-5 pb-10">
			<Text className="mb-4 font-sans-bold text-2xl text-ink">Reservations</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				Drag an account onto a savings goal to add to a reservation — or just tap the goal,
				which opens the same sheet funded from your main account. Reservations are tracked
				as real <Text className="font-sans-semibold">account → saving</Text> transactions —
				there is no hidden ledger.
			</Text>
			<Text className="mb-3 font-sans text-base text-ink">
				To release, drag the saving back to an account, or check the{' '}
				<Text className="font-sans-semibold">fund from savings</Text> box when spending from
				an account.
			</Text>
			<Text className="font-sans text-base text-ink">
				The entity detail for an account shows where its money is reserved; the detail for a
				saving shows which accounts contributed.
			</Text>
		</View>
	);
}

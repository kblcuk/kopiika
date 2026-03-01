import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { TransactionModal } from '@/src/components';

export default function AddScreen() {
	const router = useRouter();

	return (
		<View className="flex-1 bg-paper-50">
			<TransactionModal
				visible={true}
				fromEntity={null}
				toEntity={null}
				onClose={() => router.replace('/')}
				quickAdd
			/>
		</View>
	);
}

import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { TransactionModal } from '@/src/components';

export default function AddScreen() {
	const router = useRouter();
	// Tab screens stay mounted across navigations, so the modal's reset
	// effect (keyed on `visible`) only fires when we toggle visible off→on.
	const [visible, setVisible] = useState(false);

	useFocusEffect(
		useCallback(() => {
			setVisible(true);
			return () => setVisible(false);
		}, [])
	);

	return (
		<View className="flex-1 bg-paper-50">
			<TransactionModal
				visible={visible}
				fromEntity={null}
				toEntity={null}
				onClose={() => router.replace('/')}
				quickAdd
			/>
		</View>
	);
}

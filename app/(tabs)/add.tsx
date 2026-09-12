import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { TransactionModal } from '@/src/components';
import { getQuickAddKind } from '@/src/utils/quick-add-kinds';

export default function AddScreen() {
	const router = useRouter();
	// Which "+" mini-menu row opened this screen (KII-161). Anything
	// unrecognised degrades to Expense — the behaviour the button had before
	// the menu existed.
	const { kind } = useLocalSearchParams<{ kind?: string }>();
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
				quickAddKind={getQuickAddKind(kind).key}
			/>
		</View>
	);
}

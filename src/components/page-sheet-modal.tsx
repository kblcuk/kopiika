import { Modal, Platform, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PageSheetModalProps {
	visible: boolean;
	onRequestClose: () => void;
	children: ReactNode;
	/** Forwarded to the inner safe-area container (the natural Detox anchor). */
	testID?: string;
}

export function PageSheetModal({ visible, onRequestClose, children, testID }: PageSheetModalProps) {
	const insets = useSafeAreaInsets();
	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onRequestClose}
		>
			<View
				className="flex-1 bg-paper-50"
				style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
				testID={testID}
			>
				{children}
			</View>
		</Modal>
	);
}

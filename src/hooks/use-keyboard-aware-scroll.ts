import { useRef } from 'react';
import { Platform, ScrollView } from 'react-native';

interface ScrollResponder {
	scrollResponderScrollNativeHandleToKeyboard?: (
		nodeHandle: number,
		additionalOffset: number,
		preventNegativeScrollOffset: boolean
	) => void;
}

export function useKeyboardAwareScroll(additionalOffset: number = 24) {
	const scrollViewRef = useRef<ScrollView>(null);

	const scrollToTarget = (target: number | null | undefined) => {
		if (!target) return;

		const responder = scrollViewRef.current as (ScrollView & ScrollResponder) | null;
		if (!responder?.scrollResponderScrollNativeHandleToKeyboard) return;

		setTimeout(() => {
			responder.scrollResponderScrollNativeHandleToKeyboard?.(target, additionalOffset, true);
		}, 50);
	};

	const handleInputFocus = (event: { nativeEvent: { target?: number | null } }) => {
		scrollToTarget(event.nativeEvent.target);
	};

	return {
		handleInputFocus,
		keyboardAvoidingViewProps: {
			behavior: Platform.OS === 'ios' ? 'padding' : 'height',
		} as const,
		scrollViewProps: {
			ref: scrollViewRef,
			keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
			keyboardShouldPersistTaps: 'handled',
		} as const,
	};
}

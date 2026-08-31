import { Pressable, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Text } from './text';
import { PageSheetModal } from './page-sheet-modal';
import { colors } from '@/src/theme/colors';
import {
	BUBBLE_ACTION_LABELS,
	BUBBLE_GESTURE_LABELS,
	type BubbleAction,
	type BubbleGesture,
} from '@/src/utils/bubble-gestures';
import { TestIDs } from '@/e2e/support/test-ids';

const ACTIONS: BubbleAction[] = ['add', 'history'];

const ACTION_HINTS: Record<BubbleAction, string> = {
	add: 'Opens a new transaction, pre-filled from the bubble you pressed.',
	history: 'Shows past transactions filtered to that bubble.',
};

interface BubbleGesturePickerSheetProps {
	/** Which gesture is being configured; `null` keeps the sheet closed. */
	gesture: BubbleGesture | null;
	selectedAction: BubbleAction;
	onSelect: (action: BubbleAction) => void;
	onClose: () => void;
}

/**
 * Picks the action for one gesture. The two gestures always hold opposite
 * actions, so choosing here reassigns the other one too — the settings rows say
 * so, and `modeForGestureAction` does the actual swap.
 */
export function BubbleGesturePickerSheet({
	gesture,
	selectedAction,
	onSelect,
	onClose,
}: BubbleGesturePickerSheetProps) {
	const handleSelect = (action: BubbleAction) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(action);
		onClose();
	};

	return (
		<PageSheetModal
			visible={gesture !== null}
			onRequestClose={onClose}
			testID={TestIDs.bubbleGesturePicker.sheet}
		>
			<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
				<Text className="font-sans-semibold text-base text-ink">
					{gesture ? BUBBLE_GESTURE_LABELS[gesture] : ''}
				</Text>
				<Pressable
					onPress={onClose}
					hitSlop={20}
					testID={TestIDs.bubbleGesturePicker.close}
				>
					<X size={24} color={colors.ink.muted} />
				</Pressable>
			</View>

			<View className="px-5 pt-4">
				<View className="overflow-hidden rounded-lg bg-paper-100">
					{ACTIONS.map((action, index) => {
						const isSelected = action === selectedAction;
						return (
							<Pressable
								key={action}
								testID={TestIDs.bubbleGesturePicker.option(action)}
								accessibilityState={{ selected: isSelected }}
								onPress={() => handleSelect(action)}
								className={`flex-row items-center px-4 py-3.5 active:bg-paper-200 ${
									index > 0 ? 'border-t border-paper-300' : ''
								}`}
							>
								<View className="flex-1 pr-3">
									<Text className="font-sans text-base text-ink">
										{BUBBLE_ACTION_LABELS[action]}
									</Text>
									<Text className="mt-0.5 font-sans text-xs text-ink-muted">
										{ACTION_HINTS[action]}
									</Text>
								</View>
								{isSelected && <Check size={18} color={colors.ink.muted} />}
							</Pressable>
						);
					})}
				</View>

				<Text className="mt-3 font-sans text-xs text-ink-muted">
					The other gesture takes whichever action you do not pick here.
				</Text>
			</View>
		</PageSheetModal>
	);
}

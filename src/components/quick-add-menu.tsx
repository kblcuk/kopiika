import { useMemo } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, PiggyBank } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './text';
import {
	QUICK_ADD_KINDS,
	isQuickAddKindAvailable,
	type QuickAddKind,
} from '@/src/utils/quick-add-kinds';
import { useStore } from '@/src/store';
import { getEntityTypeDefaults } from '@/src/utils/entity-colors';
import { colors } from '@/src/theme/colors';
import { TestIDs } from '@/e2e/support/test-ids';

const ICONS: Record<QuickAddKind, LucideIcon> = {
	expense: ArrowDownLeft,
	income: ArrowUpRight,
	transfer: ArrowLeftRight,
	reserve: PiggyBank,
};

/** Gap between the top of the "+" button and the tip of the pointer. */
const ANCHOR_GAP = 12;
/**
 * Where the card sits until the button reports its position: roughly the same
 * spot, so the first open cannot visibly jump.
 */
const FALLBACK_BOTTOM = 68;

// Shadows are written out rather than taken from a `shadow-*` class: the rest
// of the app does the same, and iOS shadow props alone leave Android flat.
const CARD_SHADOW = {
	shadowColor: colors.ink.DEFAULT,
	shadowOffset: { width: 0, height: 6 },
	shadowOpacity: 0.18,
	shadowRadius: 16,
	elevation: 10,
};

interface QuickAddMenuProps {
	visible: boolean;
	/**
	 * Distance from the bottom of the app's container to the top of the "+"
	 * button. A hardcoded tab-bar height drifts across devices, so the button
	 * reports where it actually is and the card grows upward from there.
	 *
	 * Deliberately not a raw `measureInWindow` Y: Android measures below the
	 * status bar while `Dimensions.window` spans the whole screen, so anything
	 * subtracting one from the other is wrong by the top inset. The caller
	 * resolves both against its own layout and passes the difference.
	 */
	anchorBottom: number | null;
	onSelect: (kind: QuickAddKind) => void;
	onClose: () => void;
	/**
	 * Fired once the popup has finished dismissing (iOS only — RN's `Modal`
	 * has no Android equivalent). Callers that open another modal next must
	 * wait for this, or the presentation lands while this one is still going
	 * away and is dropped.
	 */
	onDismissed?: () => void;
}

/**
 * The quick-add mini-menu (KII-161): a popup anchored above the "+" tab
 * button listing what you can add. Each row opens the same quick-add form,
 * pre-filled for that kind — see `quick-add-kinds.ts`.
 */
export function QuickAddMenu({
	visible,
	anchorBottom,
	onSelect,
	onClose,
	onDismissed,
}: QuickAddMenuProps) {
	const insets = useSafeAreaInsets();
	const entities = useStore((state) => state.entities);

	// A row the board cannot carry out stays listed but dimmed: hiding rows
	// would leave a board with nothing to add showing an empty popup, and the
	// menu's shape is how you learn what the button can do.
	const available = useMemo(
		() =>
			Object.fromEntries(
				QUICK_ADD_KINDS.map((kind) => [kind.key, isQuickAddKindAvailable(kind, entities)])
			) as Record<QuickAddKind, boolean>,
		[entities]
	);

	const bottom =
		anchorBottom === null
			? insets.bottom + FALLBACK_BOTTOM
			: Math.max(insets.bottom + ANCHOR_GAP, anchorBottom + ANCHOR_GAP);

	const handleSelect = (kind: QuickAddKind) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(kind);
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onClose}
			onDismiss={onDismissed}
			// `anchorBottom` counts up from the bottom of the screen, so this
			// window has to reach the bottom of the screen too — by default
			// Android stops a Modal's window above the navigation bar. Both
			// props are Android-only and ignored on iOS.
			statusBarTranslucent
			navigationBarTranslucent
		>
			<Pressable
				className="flex-1"
				style={{ backgroundColor: 'rgba(26, 20, 16, 0.32)' }}
				onPress={onClose}
				accessibilityLabel="Close add menu"
				accessibilityRole="button"
				testID={TestIDs.quickAddMenu.backdrop}
			/>

			<View
				className="absolute left-0 right-0 items-center"
				style={{ bottom }}
				pointerEvents="box-none"
				testID={TestIDs.quickAddMenu.card}
			>
				<View
					className="w-60 overflow-hidden rounded-2xl border border-paper-200 bg-paper-50"
					style={CARD_SHADOW}
				>
					{QUICK_ADD_KINDS.map((kind, index) => {
						const Icon = ICONS[kind.key];
						const tint = getEntityTypeDefaults(kind.accentType);
						const isAvailable = available[kind.key];
						return (
							<Pressable
								key={kind.key}
								onPress={() => handleSelect(kind.key)}
								disabled={!isAvailable}
								accessibilityRole="button"
								accessibilityLabel={`${kind.label}. ${kind.hint}`}
								accessibilityState={{ disabled: !isAvailable }}
								testID={TestIDs.quickAddMenu.option(kind.key)}
								style={isAvailable ? undefined : { opacity: 0.4 }}
								className={`flex-row items-center gap-3 px-3.5 py-3 active:bg-paper-200 ${
									index > 0 ? 'border-t border-paper-200' : ''
								}`}
							>
								<View
									className="h-9 w-9 items-center justify-center rounded-full"
									style={{ backgroundColor: tint.bgColor }}
								>
									<Icon size={19} color={tint.iconColor} />
								</View>
								<View className="flex-1">
									<Text className="font-sans-medium text-base text-ink">
										{kind.label}
									</Text>
									<Text className="font-sans text-xs text-ink-muted">
										{kind.hint}
									</Text>
								</View>
							</Pressable>
						);
					})}
				</View>

				{/* Pointer at the card's bottom edge, aimed at the "+" button. */}
				<View
					className="h-3.5 w-3.5 rounded-br-[3px] border-b border-r border-paper-200 bg-paper-50"
					style={{ marginTop: -7, transform: [{ rotate: '45deg' }] }}
				/>
			</View>
		</Modal>
	);
}

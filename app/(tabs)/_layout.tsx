import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { colors } from '@/src/theme/colors';
import { useUnconfirmedCount } from '@/src/store';
import { useOnboardingGate } from '@/src/hooks/use-onboarding-gate';
import { QuickAddMenu } from '@/src/components/quick-add-menu';
import type { QuickAddKind } from '@/src/utils/quick-add-kinds';

/** Longest we wait for the popup's dismissal before navigating regardless. */
const DISMISS_FALLBACK_MS = 400;

export default function TabLayout() {
	const router = useRouter();
	const unconfirmedCount = useUnconfirmedCount();
	const gate = useOnboardingGate();
	const plusRef = useRef<View>(null);
	const rootRef = useRef<View>(null);
	const pendingKind = useRef<QuickAddKind | null>(null);
	const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [menuVisible, setMenuVisible] = useState(false);
	// Distance from the bottom of the screen to the top of the "+" button, so
	// the menu can sit right above it without a hardcoded tab-bar height
	// (KII-161).
	//
	// Both terms come from `measureInWindow`, deliberately: on Android its
	// origin sits below the status bar while `onLayout` and `Dimensions.window`
	// span the whole screen, so any formula mixing the two is wrong by the top
	// inset — which is exactly how this first shipped, floating a system-bar's
	// height above the button. Measuring the container through the same API
	// cancels whatever offset the platform applies, since both carry it.
	const [anchorBottom, setAnchorBottom] = useState<number | null>(null);

	// The fallback below navigates on a timer; left running it could fire after
	// the tabs are gone (a reset flips the gate to `redirect`) and drop the user
	// into the add form from wherever they landed.
	useEffect(
		() => () => {
			if (dismissTimer.current) clearTimeout(dismissTimer.current);
		},
		[]
	);

	if (gate === 'unknown') return null;
	if (gate === 'redirect') return <Redirect href="/onboarding/welcome" />;

	// Measured on layout so the first open is already positioned, and again on
	// every press so rotation or a tab-bar resize can't leave it stale.
	const measurePlus = () =>
		rootRef.current?.measureInWindow((_rootX, rootY, _rootWidth, rootHeight) => {
			plusRef.current?.measureInWindow((_x, y) => setAnchorBottom(rootY + rootHeight - y));
		});

	const handleOpenAdd = () => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		measurePlus();
		setMenuVisible(true);
	};

	// Consumes the held choice, whoever gets there first — `onDismiss` or the
	// fallback timer. Whichever loses finds it already spent and does nothing.
	const openPendingKind = () => {
		if (dismissTimer.current) {
			clearTimeout(dismissTimer.current);
			dismissTimer.current = null;
		}
		const kind = pendingKind.current;
		pendingKind.current = null;
		if (kind) router.navigate({ pathname: '/add', params: { kind } });
	};

	const handleSelectKind = (kind: QuickAddKind) => {
		setMenuVisible(false);
		pendingKind.current = kind;
		// iOS drops a modal presentation issued while another modal is still
		// dismissing, and the quick-add form is itself a page sheet — so hold
		// the choice until this popup is actually gone. Android has no
		// `onDismiss` and no such restriction, so it goes straight through.
		if (Platform.OS !== 'ios') {
			openPendingKind();
			return;
		}
		// A tap that opens nothing is the worst outcome here, so the wait has a
		// floor: if `onDismiss` doesn't arrive, navigate anyway.
		dismissTimer.current = setTimeout(openPendingKind, DISMISS_FALLBACK_MS);
	};

	return (
		<View ref={rootRef} style={{ flex: 1 }}>
			<Tabs
				screenOptions={{
					tabBarActiveTintColor: colors.ink.DEFAULT,
					tabBarInactiveTintColor: colors.ink.placeholder,
					tabBarStyle: {
						backgroundColor: colors.paper.warm,
						borderTopColor: colors.border.light,
						overflow: 'visible',
					},
					headerShown: false,
					tabBarButton: HapticTab,
				}}
			>
				<Tabs.Screen
					name="index"
					options={{
						title: 'Dashboard',
						tabBarIcon: ({ color }) => (
							<IconSymbol size={28} name="house.fill" color={color} />
						),
						tabBarButtonTestID: 'dashboard-tab-button',
					}}
				/>
				<Tabs.Screen
					name="summary"
					options={{
						title: 'Summary',
						tabBarIcon: ({ color }) => (
							<IconSymbol size={28} name="chart.bar.fill" color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="add"
					options={{
						title: '',
						tabBarButton: () => (
							<Pressable
								onPress={handleOpenAdd}
								accessibilityLabel="Add transaction"
								accessibilityRole="button"
								accessibilityHint="Opens a menu of what you can add"
								testID="add-transaction-button"
								style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
							>
								{/* The circle, not the full-height touch target, is
								    what the menu points at. */}
								<View
									ref={plusRef}
									onLayout={measurePlus}
									style={{
										width: 52,
										height: 52,
										borderRadius: 26,
										// KII-132: brand orange hardcoded here and in
										// `settings.tsx`. Move to `src/theme/colors` and
										// reference from both.
										backgroundColor: '#D4652F',
										alignItems: 'center',
										justifyContent: 'center',
										marginBottom: 4,
										shadowColor: '#D4652F',
										shadowOffset: { width: 0, height: 4 },
										shadowOpacity: 0.4,
										shadowRadius: 10,
										elevation: 8,
									}}
								>
									<Plus size={26} color="#FFFBF5" strokeWidth={2.5} />
								</View>
							</Pressable>
						),
					}}
				/>
				<Tabs.Screen
					name="history"
					options={{
						title: 'History',
						tabBarIcon: ({ color }) => (
							<IconSymbol size={28} name="clock.fill" color={color} />
						),
						tabBarButtonTestID: 'history-tab-button',
						tabBarBadge: unconfirmedCount > 0 ? unconfirmedCount : undefined,
						tabBarBadgeStyle: {
							backgroundColor: colors.warning.DEFAULT,
							color: '#fff',
							fontSize: 11,
							fontWeight: '600',
						},
					}}
				/>
				<Tabs.Screen
					name="settings"
					options={{
						title: 'Settings',
						tabBarIcon: ({ color }) => (
							<IconSymbol size={28} name="gearshape.fill" color={color} />
						),
					}}
				/>
			</Tabs>

			<QuickAddMenu
				visible={menuVisible}
				anchorBottom={anchorBottom}
				onSelect={handleSelectKind}
				onClose={() => setMenuVisible(false)}
				onDismissed={openPendingKind}
			/>
		</View>
	);
}

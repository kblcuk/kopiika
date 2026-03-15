import { Pressable, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { colors } from '@/src/theme/colors';

export default function TabLayout() {
	const router = useRouter();

	const handleOpenAdd = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		router.navigate('/add');
	};

	return (
		<>
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
								style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
							>
								<View
									style={{
										width: 52,
										height: 52,
										borderRadius: 26,
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
		</>
	);
}

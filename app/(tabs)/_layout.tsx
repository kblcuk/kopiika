import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: '#2C2416',
				tabBarInactiveTintColor: '#9C8B74',
				tabBarStyle: {
					backgroundColor: '#FAF8F5',
					borderTopColor: '#EBE5DB',
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
	);
}

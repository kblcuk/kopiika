import { Stack } from 'expo-router';

export default function OnboardingLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				gestureEnabled: false,
				animation: 'fade',
			}}
		>
			<Stack.Screen name="welcome" />
			<Stack.Screen name="setup" />
		</Stack>
	);
}

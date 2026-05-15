import { Stack } from 'expo-router';

export default function HelpLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="index" />
			<Stack.Screen name="[articleId]" options={{ presentation: 'modal' }} />
		</Stack>
	);
}

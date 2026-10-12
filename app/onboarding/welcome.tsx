import { Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Text } from '@/src/components/text';
import { setHasCompletedOnboarding } from '@/src/utils/app-prefs';
import { TestIDs } from '@/e2e/support/test-ids';

export default function WelcomeScreen() {
	const router = useRouter();

	const handleSkip = async () => {
		try {
			await setHasCompletedOnboarding(true);
			router.replace('/(tabs)');
		} catch (error) {
			console.error('Failed to skip onboarding:', error);
			Alert.alert('Could not continue', 'Please try again.');
		}
	};

	return (
		<SafeAreaView
			testID={TestIDs.onboarding.welcomeScreen}
			className="flex-1 bg-paper-50"
			edges={['top', 'bottom']}
		>
			<View className="flex-1 justify-center px-6">
				<Text className="font-sans-bold text-3xl text-ink">Kopiika</Text>
				<Text className="mt-2 font-sans text-base text-ink-muted">
					Personal finance, the way you actually think about it.
				</Text>

				<View className="mt-10" style={{ gap: 16 }}>
					<Text className="font-sans text-base text-ink">
						You handle the money in real life.
					</Text>
					<Text className="font-sans text-base text-ink">
						You record what happened in the app.
					</Text>
					<Text className="font-sans text-base text-ink">
						You see plan vs reality at a glance.
					</Text>
				</View>

				<Text className="mt-10 font-sans text-sm text-ink-muted">
					No bank linking. Start with example money, then set up your own board.
				</Text>
			</View>

			<View className="px-6 pb-6">
				<Pressable
					testID={TestIDs.onboarding.welcomeContinueButton}
					onPress={() => router.push('/onboarding/practice' as never)}
					className="h-12 items-center justify-center rounded-2xl bg-ink"
				>
					<Text className="font-sans-semibold text-base text-paper-50">
						Try with example money
					</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					testID={TestIDs.onboarding.welcomeSetupButton}
					onPress={() => router.push('/onboarding/setup')}
					className="mt-3 min-h-12 items-center justify-center rounded-2xl border border-paper-300 px-4 py-3"
				>
					<Text className="font-sans-semibold text-base text-ink">
						Set up my own board
					</Text>
				</Pressable>
				<Pressable
					testID={TestIDs.onboarding.welcomeSkipLink}
					onPress={() => {
						void handleSkip();
					}}
					className="mt-4 items-center"
				>
					<Text className="font-sans text-sm text-ink-muted">
						Skip — I&apos;ll set things up myself
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}
